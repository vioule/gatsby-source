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
    if (!this._destField) {
      return;
    } else if (tableType === 'src') {
      const related = this._destTable
        .getNodes()
        .filter((n) => n.contents[this._destField as string] === node.primaryKey);

      log.debug(
        `Resolved File node relations for ${this._srcTable.name}:${node.primaryKey}:${this._srcField} <-> ${
          this._destTable.name
        }:[${related ? related.map((p) => p.primaryKey).join(', ') : 'NONE'}]:${this._destField}`,
      );

      // We don't return an empty array with files in order to prevent
      // an association with the corresponding collection.
      if (related && related.length) {
        return related;
      } else {
        return;
      }
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
