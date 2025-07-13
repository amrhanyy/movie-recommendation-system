/**
 * Redis Health Monitoring
 * 
 * This module provides server-side health checks for Redis and safely disables
 * Redis usage across the application when it detects connection problems.
 */

// Singleton pattern to track Redis health across the app
class RedisHealthMonitor {
  private static instance: RedisHealthMonitor;
  
  // Health state
  private _isHealthy: boolean = true;
  private _isDisabled: boolean = false;
  private _lastCheckTime: number = 0;
  private _errorCounter: number = 0;
  private _maxErrorCount: number = 5;
  private _cooldownPeriod: number = 300000; // 5 minutes
  
  private constructor() {
    // Private constructor for singleton
  }
  
  public static getInstance(): RedisHealthMonitor {
    if (!RedisHealthMonitor.instance) {
      RedisHealthMonitor.instance = new RedisHealthMonitor();
    }
    return RedisHealthMonitor.instance;
  }
  
  /**
   * Record a successful Redis operation
   */
  public recordSuccess(): void {
    this._isHealthy = true;
    this._errorCounter = 0;
    this._lastCheckTime = Date.now();
  }
  
  /**
   * Record a Redis error
   * @param errorMessage The error message
   * @returns Whether Redis should be disabled
   */
  public recordError(errorMessage: string): boolean {
    this._lastCheckTime = Date.now();
    
    // Check specifically for connection limit errors
    if (errorMessage.includes('max number of clients reached')) {
      this._errorCounter++;
      this._isHealthy = false;
      
      // If we hit max error count, disable Redis
      if (this._errorCounter >= this._maxErrorCount) {
        this._isDisabled = true;
        console.log(`[RedisHealth] Disabling Redis due to ${this._errorCounter} connection errors`);
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if Redis should be used or if we should fall back to alternatives
   */
  public shouldUseRedis(): boolean {
    // If explicitly disabled, don't use Redis
    if (this._isDisabled) {
      // Allow retry after cooldown period
      if (Date.now() - this._lastCheckTime > this._cooldownPeriod) {
        console.log('[RedisHealth] Cooldown period expired, will retry Redis connections');
        this._isDisabled = false;
        this._errorCounter = 0;
        return true;
      }
      return false;
    }
    
    // If we've had some errors but not enough to disable, still use Redis
    return true;
  }
  
  /**
   * Force enable/disable Redis
   */
  public setRedisEnabled(enabled: boolean): void {
    this._isDisabled = !enabled;
    if (enabled) {
      this._errorCounter = 0;
      this._isHealthy = true;
    }
  }
  
  /**
   * Get health status
   */
  public get isHealthy(): boolean {
    return this._isHealthy;
  }
  
  /**
   * Get disabled status
   */
  public get isDisabled(): boolean {
    return this._isDisabled;
  }
}

// Export the singleton instance
export const redisHealth = RedisHealthMonitor.getInstance();

export default redisHealth; 