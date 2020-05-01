import DirectusSDK from '@directus/sdk-js';
import { IConfigurationOptions } from '@directus/sdk-js/dist/types/Configuration';
import { IAPIMetaList, IAPIResponse } from '@directus/sdk-js/dist/types/schemes/APIResponse';
import { ILoginCredentials } from '@directus/sdk-js/dist/types/schemes/auth/Login';
import { IFile } from '@directus/sdk-js/dist/types/schemes/directus/File';
import { IRelation } from '@directus/sdk-js/dist/types/schemes/directus/Relation';
import { QueryParams } from '@directus/sdk-js/dist/types/schemes/http/Query';
import { ICollectionDataSet } from '@directus/sdk-js/dist/types/schemes/response/Collection';
import { log } from '../utils';
import { PageInfo, PaginatedDirectusApiRequest } from './paginated-request';
import { BasicRequestQueue, RequestQueue } from './request-queue';

export type EditableQueryParams = Omit<QueryParams, 'meta' | 'fields' | 'offset' | 'single'>;
export type GlobalQueryParams = EditableQueryParams;
export type CollectionSpecificQueryParams = EditableQueryParams;

export interface ApiRequestConfig {
  maxResults?: number;
  pageSize?: number;
  throttle?: number;
  timeout?: number;
  maxConcurrentRequests?: number;
}

export interface DirectusServiceConfig {
  url: string;

  auth?: {
    email?: string;
    password?: string;
    token?: string;
  };

  project: string;
  fileCollectionName?: string;
  targetStatuses?: string[] | void;

  allowCollections?: string[] | void;
  blockCollections?: string[] | void;

  apiRequestConfig?: ApiRequestConfig;
  globalQueryParams?: GlobalQueryParams;
  collectionQueryParamOverrides?: { [collectionName: string]: CollectionSpecificQueryParams };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customRecordFilter?: (record: any, collection: string) => boolean;
}

export interface DirectusServiceAdaptor {
  batchGetCollections(): Promise<ICollectionDataSet[]>;
  batchGetRelations(): Promise<IRelation[]>;
  getAllFiles(): Promise<IFile[]>;
  getFilesCollection(): Promise<ICollectionDataSet>;
  batchGetCollectionRecords(collections: ICollectionDataSet[]): Promise<{ [collection: string]: any[] }>;
}

export class DirectusService implements DirectusServiceAdaptor {
  private static _voidStatusKey = '__NONE__';

  private _fileCollectionName = 'directus_files';
  private _targetStatuses: string[] | void = ['published', DirectusService._voidStatusKey];
  private _includeInternalCollections = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _customRecordFilter?: (record: any, collection: string) => boolean;

  private _allowCollections: string[] | void;
  private _blockCollections: string[] | void;

  private _url: string;
  private _project: string;

  private _globalQueryParams: QueryParams = { limit: -1 };
  private _collectionQueryParams: { [collectionName: string]: CollectionSpecificQueryParams } = {};
  private _apiRequestConfig: ApiRequestConfig = {
    maxResults: Number.POSITIVE_INFINITY,
  };

  private _api: DirectusSDK;
  private _ready: Promise<void>;

  private _requestQueue: RequestQueue;
  private _totalResults = 0;

  constructor(config: DirectusServiceConfig) {
    log.info('Initializing Directus Service...');

    if (config.fileCollectionName) {
      this._fileCollectionName = config.fileCollectionName;
    }

    if (Object.prototype.hasOwnProperty.call(config, 'targetStatuses')) {
      this._targetStatuses = config.targetStatuses;
    }

    if (typeof config.customRecordFilter === 'function') {
      this._customRecordFilter = config.customRecordFilter;
    }

    this._allowCollections = config.allowCollections;
    this._blockCollections = config.blockCollections;

    this._url = config.url;
    this._project = config.project;

    if (config.globalQueryParams) {
      Object.assign(this._globalQueryParams, config.globalQueryParams);
    }

    if (config.collectionQueryParamOverrides) {
      Object.assign(this._collectionQueryParams, config.collectionQueryParamOverrides);
    }

    if (config.apiRequestConfig) {
      Object.assign(this._apiRequestConfig, config.apiRequestConfig);
    }

    this._api = this._initSDK(config);
    this._ready = this._initAuth(config);
    this._requestQueue = new BasicRequestQueue({ ...this._apiRequestConfig });
  }

  private _initSDK({ url, project, auth = {} }: DirectusServiceConfig): DirectusSDK {
    const config: IConfigurationOptions = {
      url,
      project,
      mode: 'jwt',
    };

    if (auth.token) {
      config.token = auth.token;
      config.persist = true;
    }

    return new DirectusSDK(config);
  }

  private async _initAuth({ auth: { token, email, password } = {} }: DirectusServiceConfig): Promise<void> {
    if (token) {
      return;
    } else if (email && password) {
      return this._login({ email, password, url: this._url, project: this._project });
    }

    log.warn('No authentication details provided. Will try using the public API...');
  }

  private async _login(credentials: ILoginCredentials): Promise<void> {
    try {
      if (!this._api.config.token) {
        const response = await this._api.login(credentials, {
          mode: 'jwt',
          persist: true,
          storage: true,
        });

        if (!response || !response.data.token) {
          throw new Error('Invalid response returned.');
        }

        log.success('Authentication successful.');
      }
    } catch (e) {
      log.warn('Failed to login into Directus using the credentials provided. Will try using the public API...');
    }
  }

  private _shouldIncludeCollection(collection: string, managed = false): boolean {
    if (this._allowCollections && !this._allowCollections.includes(collection)) {
      return false;
    } else if (this._blockCollections && this._blockCollections.includes(collection)) {
      return false;
    }

    return this._includeInternalCollections || managed;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _shouldIncludeRecord(record: any, collection: string): boolean {
    const { status } = record;

    if (typeof this._customRecordFilter === 'function') {
      return this._customRecordFilter(record, collection);
    }

    if (!this._targetStatuses) return true;

    if (!status) return this._targetStatuses.includes(DirectusService._voidStatusKey);

    return this._targetStatuses.includes(record.status);
  }

  // public async getCollection(collectionId: string): Promise<ICollectionResponse> {
  //   try {
  //     await this._ready;
  //     log.info(`Fetching collection info for "${collectionId}"`);

  //     const request = this._makePaginatedRequest(params => this._api.getCollection(collectionId, params));

  //     this._requestQueue.enqueue(request);

  //     const [result] = await request.finished();

  //     return result;

  //   } catch (e) {
  //     log.error(`Failed to fetch collection ${collectionId}`);
  //     throw e;
  //   }
  // }

  public async getFilesCollection(): Promise<ICollectionDataSet> {
    try {
      await this._ready;
      log.info(`Fetching files collection using name "${this._fileCollectionName}"`);

      // For some reason, api.getCollection(this._fileCollectionName) is not working
      // at time of authorship.
      const request = this._makePaginatedRequest(
        params =>
          this._api.getCollections({
            ...this._getCollectionParams('directus_collections'),
            ...params,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      this._requestQueue.enqueue(request);

      // Explicit 'any' cast because ICollectionsResponse doesn't match the actual response shape (DirectusSDK bug)
      const results = await request.finished();

      const fileCollection = (results as ICollectionDataSet[]).find(
        ({ collection }) => collection === this._fileCollectionName,
      );

      if (!fileCollection) {
        throw new Error('No collection matching the given name found');
      }

      return fileCollection;
    } catch (e) {
      log.error('Failed to fetch files collection');
      throw e;
    }
  }

  public async batchGetCollections(): Promise<ICollectionDataSet[]> {
    try {
      await this._ready;
      log.info('Fetching all collections...');

      // Explicit 'any' cast because ICollectionsResponse doesn't match the actual response shape (DirectusSDK bug)
      const request = this._makePaginatedRequest(
        params =>
          this._api.getCollections({
            ...this._getCollectionParams('directus_collections'),
            ...params,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      );

      this._requestQueue.enqueue(request);

      const results = await request.finished();

      // Currently we don't consider non-managed Directus tables.
      return (results as ICollectionDataSet[]).filter(({ collection, managed }) =>
        this._shouldIncludeCollection(collection, managed),
      );
    } catch (e) {
      log.error('Failed to fetch collections');
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async batchGetRelations(): Promise<IRelation[]> {
    try {
      await this._ready;
      log.info('Fetching all relations...');

      const request = this._makePaginatedRequest(params =>
        this._api.getRelations({
          ...this._getCollectionParams('directus_relations'),
          ...params,
        }),
      );

      this._requestQueue.enqueue(request);

      return await request.finished();
    } catch (e) {
      log.error('Failed to fetch relations');
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async getCollectionRecords(collection: string): Promise<any[]> {
    try {
      await this._ready;
      log.info(`Fetching records for ${collection}...`);

      const request = this._makePaginatedRequest(params =>
        this._api.getItems(collection, {
          ...this._getCollectionParams(collection),
          fields: '*.*',
          ...params,
        }),
      );

      this._requestQueue.enqueue(request);

      const results = await request.finished();

      return results.filter(record => this._shouldIncludeRecord(record, collection));
    } catch (e) {
      log.error(`Failed to fetch records for collection "${collection}"`);
      log.error(`Did you grant READ permissions?`);
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public batchGetCollectionRecords(collections: ICollectionDataSet[]): Promise<{ [collection: string]: any[] }> {
    log.info('Fetching all records...');

    return Promise.all(collections.map(({ collection }) => this.getCollectionRecords(collection))).then(
      (recordSets = []) => {
        return recordSets.reduce((recordMap, records, i) => {
          recordMap[collections[i].collection] = records || [];
          return recordMap;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, {} as { [collection: string]: any[] });
      },
    );
  }

  public async getAllFiles(): Promise<IFile[]> {
    try {
      await this._ready;
      log.info('Fetching all files...');

      const request = this._makePaginatedRequest(params =>
        this._api.getFiles({
          ...this._getCollectionParams('directus_files'),
          ...params,
        }),
      );

      this._requestQueue.enqueue(request);

      // The SDK has 'data' typed as IFile[][], but in reality
      // it's returned as IFile[]
      //
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await request.finished()) as any;
    } catch (e) {
      log.error('Failed to fetch files.');
      log.error(`Did you grant READ permissions?`);
      throw e;
    }
  }

  private _makePaginatedRequest<T extends IAPIResponse<{}>>(
    fn: (params: QueryParams) => Promise<T>,
  ): PaginatedDirectusApiRequest<T['data'] extends Array<infer J> ? J : T['data']> {
    return new PaginatedDirectusApiRequest<T>({
      makeApiRequest: (params: QueryParams): Promise<IAPIResponse<T, IAPIMetaList>> => fn(params) as any,
      beforeNextPage: this._beforeNextPaginatedRequest,
    }) as any;
  }

  private _beforeNextPaginatedRequest({ resultCount }: PageInfo): boolean {
    this._totalResults += resultCount;

    if (typeof this._apiRequestConfig.maxResults === 'number') {
      return this._totalResults < this._apiRequestConfig.maxResults;
    }

    return true;
  }

  private _getCollectionParams(collectionName: string): QueryParams {
    if (Object.prototype.hasOwnProperty.call(this._collectionQueryParams, collectionName)) {
      return {
        ...this._globalQueryParams,
        ...this._collectionQueryParams[collectionName],
      };
    }
    return this._globalQueryParams;
  }
}
