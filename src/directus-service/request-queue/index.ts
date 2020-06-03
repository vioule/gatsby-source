import { IsInt, Min, IsPositive, validateSync } from 'class-validator';

export interface QueueableRequest<T = unknown> {
  exec(): Promise<IteratorResult<T>>;
  results(): T;
  reset(): void;
  finished(): Promise<T>;
}

export interface RequestQueueConfig {
  maxConcurrentRequests?: number;
  throttle?: number;
}

export interface RequestQueue<T = any> {
  enqueue(request: QueueableRequest<T>): void;
  flush(): Promise<void>;
  results(): T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class BasicRequestQueue<T = any> implements RequestQueue<T> {
  private _queue: QueueableRequest<T>[] = [];
  private _active: Promise<IteratorResult<T>>[] = [];

  private _failed: QueueableRequest<T>[] = [];
  private _completed: QueueableRequest<T>[] = [];

  // @IsInt({ message: 'Expected an integer maxConcurrentRequests, received $value' })
  // @IsPositive({ message: 'Expected a positive maxConcurrentRequests, received $value' })
  private _maxConcurrentRequests: number = Number.POSITIVE_INFINITY;

  // @IsInt({ message: 'Expected an integer throttle, received $value' })
  // @Min(0, { message: 'Expected a throttle >= 0, received $value' })
  private _throttle = 0;

  private _currentFlush: Promise<void> | void = undefined;

  constructor(config: RequestQueueConfig) {
    if (typeof config.maxConcurrentRequests === 'number') {
      this._maxConcurrentRequests = config.maxConcurrentRequests;
    }

    if (typeof config.throttle === 'number') {
      this._throttle = config.throttle;
    }

    const validationErrors = validateSync(this);

    if (validationErrors.length) {
      throw new Error('Validation errors: \n' + validationErrors.join('\n'));
    }
  }

  public enqueue(request: QueueableRequest<T>): void {
    this._queue.unshift(request);
    this._scheduleFlush();
  }

  public async flush(): Promise<void> {
    // Prevent multiple simultaneous flushes
    if (this._currentFlush) {
      await this._currentFlush;
    } else {
      // Ensure 'currentFlush' is cleared after the flush finishes.
      await (this._currentFlush = this._startFlush().finally(() => (this._currentFlush = undefined)));
    }
  }

  public results(): T[] {
    return this._completed.map((r) => r.results());
  }

  private _scheduleFlush(): void {
    if (!this._currentFlush) {
      this.flush().catch(() => void 0);
    }
  }

  private async _startFlush(): Promise<void> {
    // Continue to queue requests until request queue is empty
    while (this._queue.length) {
      // Fill up the active queue with queued requests.
      while (this._active.length < this._maxConcurrentRequests && this._queue.length) {
        this._activateRequest(this._queue.pop()!);
      }

      // Wait for any request to finish. Again '_active'
      // is guaranteed to be at least one promise long.
      await Promise.race(this._active);

      // Wait for the throttle if present before
      // continuing to next request
      if (this._throttle > 0) {
        await new Promise((r) => setTimeout(r, this._throttle));
      }
    }
  }

  private async _activateRequest(request: QueueableRequest<T>): Promise<void> {
    const activeRequest = request.exec();
    this._active.push(activeRequest);

    try {
      const curs = await activeRequest;
      if (!curs.done) this.enqueue(request);
      else this._handleRequestComplete(request);
    } catch (e) {
      this._handleRequestError(e, request);
    } finally {
      this._removeActive(activeRequest);
    }
  }

  private _handleRequestComplete(request: QueueableRequest<T>): void {
    this._completed.push(request);
  }

  private _handleRequestError(e: Error, request: QueueableRequest<T>): void {
    this._failed.push(request);
  }

  private _removeActive(request: Promise<IteratorResult<T, any>>): void {
    this._active = this._active.filter((r) => r !== request);
  }
}
