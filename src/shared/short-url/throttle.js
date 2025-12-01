// Short URL request throttling

/**
 * Short URL request throttler - fixes concurrency issues
 */
export class ShortUrlThrottle {
  constructor() {
    this.concurrentLimit = 3; // max 3 concurrent requests
    this.requestQueue = [];
    this.activeRequests = 0;
    this.requestDelay = 200; // 200ms delay between requests
    this.lastRequestTime = 0;
    this.isProcessing = false; // prevent duplicate queue processing
    this.requestTimeLock = Promise.resolve(); // request time lock for serial updates
  }

  async throttledRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    // Prevent concurrent queue processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Continue processing queue until concurrent limit is reached or queue is empty
      while (
        this.activeRequests < this.concurrentLimit &&
        this.requestQueue.length > 0
      ) {
        const { requestFn, resolve, reject } = this.requestQueue.shift();
        this.activeRequests++;

        // Execute request asynchronously, don't wait for completion
        this.executeRequest(requestFn, resolve, reject);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async executeRequest(requestFn, resolve, reject) {
    try {
      // Use lock to ensure serial updates of lastRequestTime
      await this.requestTimeLock;

      // Create new lock for next request
      let releaseLock;
      this.requestTimeLock = new Promise((r) => (releaseLock = r));

      try {
        // Ensure request interval
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.requestDelay - timeSinceLastRequest),
          );
        }

        // Update last request time
        this.lastRequestTime = Date.now();
      } finally {
        // Release lock
        releaseLock();
      }

      // Execute actual request
      const result = await requestFn();

      // Call progress callback (if exists)
      if (this.progressCallback) {
        try {
          this.progressCallback();
        } catch (callbackError) {
          console.debug("Progress callback error:", callbackError);
        }
      }

      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.activeRequests--;
      // Use microtask to continue processing queue, avoid setTimeout uncertainty
      queueMicrotask(() => this.processQueue());
    }
  }

  // Set progress callback (for batch operation progress display)
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  // Clear progress callback
  clearProgressCallback() {
    this.progressCallback = null;
  }

  // Get queue status (for debugging)
  getStatus() {
    return {
      activeRequests: this.activeRequests,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}

// Create global short URL throttler instance
export const globalShortUrlThrottle = new ShortUrlThrottle();
