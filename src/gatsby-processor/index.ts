import createNodeHelpers from 'gatsby-node-helpers';
import { ContentMesh, ContentNode } from '../content-mesh';
import { GatsbyType } from './gatsby-type';
import { IFile } from '@directus/sdk-js/dist/types/schemes/directus/File';

export interface GatsbyProcessorConfig {
  typePrefix?: string;
  includeJunctions?: boolean;
  downloadFiles?: boolean | ((relatedCollections: string[], fileRec: IFile) => boolean);
}

export class GatsbyProcessor {
  private _typePrefix = 'Directus';
  private _includeJunctions = false;
  private _downloadFiles: boolean | ((relatedCollections: string[], fileRec: IFile) => boolean) = true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public gatsby: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public createNodeFactory: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public generateNodeId: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: GatsbyProcessorConfig, gatsby: any) {
    if (typeof config.typePrefix === 'string') {
      this._typePrefix = config.typePrefix;
    }

    if (typeof config.includeJunctions === 'boolean') {
      this._includeJunctions = config.includeJunctions;
    }

    if (typeof config.downloadFiles === 'boolean' || typeof config.downloadFiles === 'function') {
      this._downloadFiles = config.downloadFiles;
    }

    const { createNodeFactory, generateNodeId } = createNodeHelpers({
      typePrefix: this._typePrefix,
    });

    this.createNodeFactory = createNodeFactory;
    this.generateNodeId = generateNodeId;
    this.gatsby = gatsby;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async processMesh(mesh: ContentMesh): Promise<any[]> {
    const nodes = await Promise.all(
      mesh
        .getCollections()
        .filter(({ isJunction }) => !isJunction || this._includeJunctions)
        .map((collection) => new GatsbyType(collection, this).buildNodes()),
    );

    return Promise.all(
      nodes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((flattened, nodes) => [...flattened, ...nodes], [] as any[])
        .map((node) => this.gatsby.actions.createNode(node)),
    );
  }

  public shouldDownloadFile(node: ContentNode): boolean {
    if (typeof this._downloadFiles === 'function') {
      const relatedCollections = node.getRelatedCollections().map((n) => n.name);
      return this._downloadFiles(relatedCollections, node.contents);
    }

    return this._downloadFiles;
  }
}
