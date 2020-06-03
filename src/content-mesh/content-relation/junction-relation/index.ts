import { ContentCollection } from '../../content-collection';
import { ContentRelationConfig, ContentRelation } from '..';
import { ContentNode } from '../../content-node';
import { log } from '../../../utils';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _getRelatedJunctionRecords(targetId: string, tableType: 'src' | 'dest'): any[] {
    const targetJuncField = tableType === 'src' ? this._destJunctionField : this._srcJunctionField;
    const destJuncField = tableType === 'src' ? this._srcJunctionField : this._destJunctionField;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = this._getRelatedJunctionRecords(node.primaryKey, tableType);

    // Explicit cast here because we're filtering out any
    // 'void' values.
    const related = existing
      .map((junctionRecord) => this._resolveJunctionNodes(junctionRecord))
      .map(({ src, dest }) => (tableType === 'src' ? dest : src))
      .filter((node) => !!node) as ContentNode[];

    const targetField = tableType === 'src' ? this._srcField : this._destField;
    const targetTable = tableType === 'src' ? this._srcTable : this._destTable;
    const destField = tableType === 'src' ? this._destField : this._srcField;
    const destTable = tableType === 'src' ? this._destTable : this._srcTable;

    log.debug(
      `Resolved M2M node relations for ${targetTable.name}.${node.primaryKey}.${targetField} <-> ${
        destTable.name
      }.[${related.map((p) => p.primaryKey).join(', ')}].${destField}`,
    );

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
