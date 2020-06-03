import { ContentCollection } from '../../content-collection';
import { ContentRelationConfig, ContentRelation } from '..';
import { ContentNode } from '../../content-node';

export interface JunctionContentRelationConfig extends ContentRelationConfig {
  srcJunctionField: string;
  destJunctionField: string;
  junctionTable: ContentCollection;
}

export class JunctionContentRelation extends ContentRelation {
  protected _srcJunctionField: string;
  protected _destJunctionField: string;
  protected _junctionTable: ContentCollection;

  constructor(config: JunctionContentRelationConfig) {
    super(config);
    this._junctionTable = config.junctionTable;
    this._srcJunctionField = config.srcJunctionField;
    this._destJunctionField = config.destJunctionField;

    config.junctionTable.flagJunction();
  }

  protected _getRelatedJunctionRecords(targetId: string, tableType: 'src' | 'dest'): any[] {
    const targetJuncField = tableType === 'src' ? this._srcJunctionField : this._destJunctionField;
    const destJuncField = tableType === 'src' ? this._destJunctionField : this._srcJunctionField;

    return this._junctionTable
      .getNodes()
      .filter(
        (r) =>
          r.contents[destJuncField] != null &&
          r.contents[targetJuncField] != null &&
          r.contents[targetJuncField] === targetId,
      )
      .map((r) => r.contents);
  }

  protected _resolveNodeRelation(node: ContentNode, tableType: 'src' | 'dest'): void | ContentNode | ContentNode[] {
    // const targetField = tableType === 'src' ? this._srcField : this._destField;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any

    // const existing: any[] = node.contents[targetField] || [];
    const existing: any[] = this._getRelatedJunctionRecords(node.primaryKey, tableType);

    // console.log('Resolving JUNCTION relation', { existing, targetField, tableType, table: this._junctionTable.name });

    // Explicit cast here because we're filtering out any
    // 'void' values.
    const related = existing
      .map((junctionRecord) => this._resolveJunctionNodes(junctionRecord))
      .map(({ src, dest }) => (tableType === 'src' ? dest : src))
      .filter((node) => !!node) as ContentNode[];

    // return []

    console.warn('resolving JUNCTION relation', {
      id: node.primaryKey,
      tableType,
      existing: related.map((p) => p.primaryKey),
    });

    return related;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _resolveJunctionNodes(junctionRecord: any): { src: ContentNode | void; dest: ContentNode | void } {
    return {
      src: this._srcTable.getByPrimaryKey(junctionRecord[this._destJunctionField]),
      dest: this._destTable.getByPrimaryKey(junctionRecord[this._srcJunctionField]),
    };
  }
}
