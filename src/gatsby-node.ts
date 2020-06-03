import { ContentMesh } from './content-mesh';
import { DirectusService, DirectusServiceConfig, DirectusServiceAdaptor } from './directus-service';
import { GatsbyProcessor, GatsbyProcessorConfig } from './gatsby-processor';
import { log } from './utils';

export type PluginConfig = DirectusServiceConfig & GatsbyProcessorConfig;

export const sourceNodes = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gatsby: any,
  config: PluginConfig,
): Promise<void> => {
  log.info(`Validating config...`);
  log.info(`Starting...`);

  log.info(`URL: ${config.url}`);
  log.info(`Project: ${config.project}`);

  const service: DirectusServiceAdaptor = new DirectusService(config);

  try {
    const [collections, relations, fileCollection] = await Promise.all([
      service.batchGetCollections(),
      service.batchGetRelations(),
      service.getFilesCollection(),
    ]);

    const [records, files] = await Promise.all([service.batchGetCollectionRecords(collections), service.getAllFiles()]);

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
