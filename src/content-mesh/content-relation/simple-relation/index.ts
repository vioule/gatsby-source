import { ContentRelation, ContentRelationConfig } from '..';
import { ContentNode } from '../../content-node';
import { log } from '../../../utils';

export type SimpleContentRelationConfig = ContentRelationConfig;

export class SimpleContentRelation extends ContentRelation {
  constructor(config: SimpleContentRelationConfig) {
    super(config);
  }

  protected _getRelatedRecords(targetId: string, tableType: 'src' | 'dest'): ContentNode[] | void {
    const destField = tableType === 'src' ? this._destField : this._srcField;
    const destTable = tableType === 'src' ? this._destTable : this._srcTable;

    if (!destField) {
      return;
    }

    return destTable.getNodes().filter((n) => n.contents[destField] === targetId);
  }

  protected _resolveNodeRelation(node: ContentNode, tableType: 'src' | 'dest'): void | ContentNode | ContentNode[] {
    if (tableType === 'src') {
      const related = this._getRelatedRecords(node.primaryKey, tableType);

      log.debug(
        `Resolved O2M node relations for ${this._srcTable.name}:${node.primaryKey}:${this._srcField} <-> ${
          this._destTable.name
        }:[${related ? related.map((p) => p.primaryKey).join(', ') : 'NONE'}]:${this._destField}`,
      );

      return related;
    } else {
      if (!this._destField) {
        return;
      }

      const existing = node.contents[this._destField];

      if (existing) {
        const related = this._srcTable.getByPrimaryKey(existing);

        log.debug(
          `Resolved O2M node relations for ${this._destTable.name}:${node.primaryKey}:${this._destField} <-> ${
            this._srcTable.name
          }:${related ? related.primaryKey : 'NONE'}:${this._srcField}`,
        );

        return related;
      }
    }
  }
}
