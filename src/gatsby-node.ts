import { validator } from './config-validator';
import { ContentMesh } from './content-mesh';
import { DirectusService, DirectusServiceConfig } from './directus-service';
import { GatsbyProcessor, GatsbyProcessorConfig } from './gatsby-processor';
import { log } from './utils';

export type PluginConfig = DirectusServiceConfig & GatsbyProcessorConfig;

export const sourceNodes = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gatsby: any,
  config: PluginConfig,
): Promise<void> => {
  log.info(`Validating config...`);

  const configErrors = validator.validate(config);

  if (configErrors.length) {
    configErrors.forEach(e => log.error(e));
    throw new Error('INVALID_CONFIG');
  }

  log.info(`Starting...`);

  log.info(`URL: ${config.url}`);
  log.info(`Project: ${config.project}`);

  const service: DirectusServiceAdaptor = new DirectusService(config);

  try {
    const [collections, relations, files, fileCollection] = await Promise.all([
      service.batchGetCollections(),
      service.batchGetRelations(),
      service.getAllFiles(),
      service.getFilesCollection(),
    ]);

    const records = await service.batchGetCollectionRecords(collections);

    const contentMesh = new ContentMesh({
      collections: [...collections, fileCollection],
      records: { ...records, [fileCollection.collection]: files },
      relations,
    });

    const processor = new GatsbyProcessor(config, gatsby);
    await processor.processMesh(contentMesh);

    log.success('Processing complete');
  } catch (e) {
    log.error('Failed to build Directus nodes', { e });
  }
};
