export interface QueueableRequest<T = unknown> {
  exec(): AsyncGenerator<T>;
  results(): T | void;
}

export interface RequestQueueConfig {
  maxConcurrentRequests?: number;
  throttle?: number;
  timeout?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class RequestQueue<T = any> {
  private _queue: QueueableRequest<T>[] = [];
  private _active: QueueableRequest<T>[] = [];
  private _failed: QueueableRequest<T>[] = [];

  private _maxConcurrentRequests: number = Number.POSITIVE_INFINITY;
  private _throttle = 0;
  private _timeout = 15 * 1000;

  private _flushScheduled = false;
  private _isFlushing = true;

  constructor(config: RequestQueueConfig) {
    if (typeof config.maxConcurrentRequests === 'number' && config.maxConcurrentRequests > 0) {
      this._maxConcurrentRequests = config.maxConcurrentRequests;
    }

    if (
      typeof config.throttle === 'number' &&
      !isNaN(config.throttle) &&
      Number.isFinite(config.throttle) &&
      config.throttle >= 0
    ) {
      this._throttle = config.throttle;
    }

    if (
      typeof config.timeout === 'number' &&
      !isNaN(config.timeout) &&
      Number.isFinite(config.timeout) &&
      config.timeout >= 0
    ) {
      this._timeout = config.timeout;
    }
  }

  public enqueue(request: QueueableRequest<T>): void {
    this._queue.unshift(request);
    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    this._flushScheduled = true;
    this._startFlush();
  }

  private async _startFlush(): Promise<void> {
    if (
      !this._flushScheduled ||
      this._isFlushing ||
      !this._queue.length ||
      this._active.length >= this._maxConcurrentRequests
    ) {
      return;
    }

    this._flushScheduled = false;
    this._isFlushing = true;

    while (this._active.length < this._maxConcurrentRequests) {
      const request = this._queue.pop() as QueueableRequest<T>;
      this._active.push(request);
      request
        .exec()
        .next()
        .then(curs => {
          this._handleRequestSuccess(request);
          if (!curs.done) this.enqueue(request);
        })
        .catch(e => {
          this._handleRequestError(e, request);
        });
    }

    if (this._throttle > 0) {
      setTimeout(() => this._onFlushCompleted(), this._throttle);
    } else {
      this._onFlushCompleted();
    }
  }

  private _onFlushCompleted(): void {
    this._isFlushing = false;
    this._scheduleFlush();
  }

  private _handleRequestSuccess(request: QueueableRequest<T>): void {
    this._active = this._active.filter(r => r !== request);
  }

  private _handleRequestError(error: Error, request: QueueableRequest<T>): void {
    this._active = this._active.filter(r => r !== request);
    this._failed.push(request);
  }
}
