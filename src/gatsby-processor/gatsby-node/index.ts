import { ContentNode } from '../../content-mesh';
import { GatsbyType } from '../gatsby-type';
import { GatsbyProcessor } from '..';
import { createRemoteFileNode } from 'gatsby-source-filesystem';
import { log } from '../../utils';

export class GatsbyNode {
  protected _node: ContentNode;
  protected _processor: GatsbyProcessor;

  constructor(node: ContentNode, processor: GatsbyProcessor) {
    this._node = node;
    this._processor = processor;
  }

  public getIds(node: ContentNode | ContentNode[]): string | string[] {
    if (Array.isArray(node)) {
      return node.map((node) => this._resolveId(node));
    }

    return this._resolveId(node);
  }

  private _resolveId(node: ContentNode): string {
    return this._processor.generateNodeId(GatsbyType.getTypeName(node.getCollection()), node.primaryKey);
  }

  private static _formatFieldName(field: string): string {
    return `${field}___NODE`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mixinRelations(contents: any): any {
    return Object.entries(this._node.getRelations()).reduce(
      (newContents, [field, relation]) => {
        delete newContents[field];

        const relatedNodes = relation.getRelatedNodes();

        const targetColName = (Array.isArray(relatedNodes)
          ? (relatedNodes as ContentNode[])
          : [relatedNodes as ContentNode]
        ).map((n) => n.getCollection().name)[0];
        const targetIds = (Array.isArray(relatedNodes)
          ? (relatedNodes as ContentNode[])
          : [relatedNodes as ContentNode]
        ).map((n) => n.primaryKey);

        console.warn(
          `Mixing in relation ${this._node.getCollection().name}:${
            this._node.primaryKey
          } -> ${targetColName}:[${targetIds.join(', ')}]`,
        );

        const newFieldName = GatsbyNode._formatFieldName(field);
        newContents[newFieldName] = this.getIds(relatedNodes);

        return newContents;
      },
      { ...contents },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async build(): Promise<any> {
    // Ensure ID field is set to the primary key.
    const contents = {
      ...this._node.contents,
      id: this._node.primaryKey,
    };

    if (this._node.getCollection().acceptsRelations()) {
      return this._mixinRelations(contents);
    }

    return contents;
  }
}

export class GatsbyFileNode extends GatsbyNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public async build(): Promise<any> {
    const localNode = await super.build();

    try {
      const remoteNode = await createRemoteFileNode({
        store: this._processor.gatsby.store,
        cache: this._processor.gatsby.cache,
        createNode: this._processor.gatsby.actions.createNode,
        createNodeId: this._processor.gatsby.createNodeId,
        reporter: this._processor.gatsby.reporter,
        url: localNode.data.full_url,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/camelcase
      localNode.localFile___NODE = (remoteNode as any).id;
    } catch (e) {
      log.error(`Failed to download remote file: ${localNode.data.full_url}`);
      log.error('File will not be available through transforms.');
    }

    return localNode;
  }
}
