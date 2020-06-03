import { ContentCollection } from '../../content-collection';
import { ContentRelation } from '..';
import { ContentNode } from '../../content-node';
import { ContentMesh } from '../..';
import { log } from '../../../utils';

export interface FileContentRelationConfig {
  fileTable: ContentCollection;
  destTable: ContentCollection;
  destField: string;
  mesh: ContentMesh;
}

export class FileContentRelation extends ContentRelation {
  constructor(config: FileContentRelationConfig) {
    super({
      destField: config.destField,
      destTable: config.destTable,
      mesh: config.mesh,
      srcTable: config.fileTable,
      srcField: 'id',
    });
  }

  protected _resolveNodeRelation(node: ContentNode, tableType: 'src' | 'dest'): void | ContentNode | ContentNode[] {
    // We won't crete relations for the file nodes.
    if (tableType === 'src') {
      return;
    }

    const existing = node.contents[this._destField];

    if (existing) {
      const related = this._srcTable.getByPrimaryKey(existing);
      log.debug(
        `Resolved File node relations for ${this._destTable.name}:${node.primaryKey}.${this._destField} <-> ${
          this._srcTable.name
        }.${related ? related.primaryKey : 'NONE'}:${this._srcField}`,
      );
      return related;
    }
  }
}
