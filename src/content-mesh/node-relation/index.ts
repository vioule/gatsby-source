import { ContentNode } from '../content-node';
import { ContentCollection } from '../content-collection';

export interface NodeRelationConfig {
  field: string | void;
  relatedCollection: ContentCollection;
  related: void | ContentNode | ContentNode[];
}

export class NodeRelation {
  public readonly field: string | void;
  private _relatedCollection: ContentCollection;
  private _related: void | ContentNode | ContentNode[];

  constructor(config: NodeRelationConfig) {
    this.field = config.field;
    this._related = config.related;
    this._relatedCollection = config.relatedCollection;
  }

  public getRelatedNodes(): void | ContentNode | ContentNode[] {
    return this._related;
  }

  public getRelatedCollection(): ContentCollection {
    return this._relatedCollection;
  }
}
