import { ContentRelation, ContentRelationConfig } from '..';
import { ContentNode } from '../../content-node';

export type SimpleContentRelationConfig = ContentRelationConfig;

export class SimpleContentRelation extends ContentRelation {
  constructor(config: SimpleContentRelationConfig) {
    super(config);
  }

  protected _getRelatedRecords(targetId: string, tableType: 'src' | 'dest'): ContentNode[] {
    const destField = tableType === 'src' ? this._destField : this._srcField;
    const destTable = tableType === 'src' ? this._destTable : this._srcTable;

    return destTable.getNodes().filter((n) => n.contents[destField] === targetId);
  }

  protected _resolveNodeRelation(node: ContentNode, tableType: 'src' | 'dest'): void | ContentNode | ContentNode[] {
    if (tableType === 'src') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any

      // const existing: any[] = node.contents[this._srcField] || [];
      //
      // return existing.map(record => this._destTable.getByPrimaryKey(record)).filter(node => !!node) as ContentNode[];

      const existing = this._getRelatedRecords(node.primaryKey, tableType);

      console.warn('resolving SIMPLE relation', {
        id: node.primaryKey,
        tableType,
        existing: existing.map((p) => p.primaryKey),
      });

      return existing;
    } else {
      const existing = node.contents[this._destField];

      if (existing) {
        const related = this._srcTable.getByPrimaryKey(existing);

        console.warn('resolving SIMPLE relation', {
          id: node.primaryKey,
          tableType,
          existing: !!related && related.primaryKey,
        });
      }
    }
  }
}
