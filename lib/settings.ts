import fs from 'fs';
import path from 'path';

// Path to the settings file
const CONFIG_FILE_PATH = path.join(process.cwd(), 'config', 'settings.json');

// Default configuration - updated to match SystemSettings.tsx structure
const DEFAULT_CONFIG = {
  features: {
    recommendations: true,
    history: true,
    watchlist: true,
    reviews: true,
    aiAssistant: true,
  },
  content: {
    defaultLanguage: 'en-US',
    adultContent: false,
    maxRecommendations: 10,
    autoPlayTrailers: true,
    notificationEnabled: true,
  }
};

/**
 * Get system settings
 * @returns Current system configuration
 */
export async function getSystemSettings() {
  try {
    // Check if settings file exists
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      return DEFAULT_CONFIG;
    }
    
    // Read and parse settings
    const rawData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
    const parsedData = JSON.parse(rawData);
    
    // Ensure all expected properties exist (backward compatibility)
    const config = {
      features: {
        ...DEFAULT_CONFIG.features,
        ...parsedData.features
      },
      content: {
        ...DEFAULT_CONFIG.content,
        ...parsedData.content
      }
    };
    
    return config;
  } catch (error) {
    console.error('Error reading settings:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Get a specific setting value
 * @param section Section of settings (features, content)
 * @param key Setting key to retrieve
 * @param defaultValue Default value if setting is not found
 * @returns Setting value
 */
export async function getSetting<T>(section: string, key: string, defaultValue: T): Promise<T> {
  try {
    const settings = await getSystemSettings();
    
    // Check if section exists
    if (!settings[section]) {
      return defaultValue;
    }
    
    // Check if key exists in section
    if (settings[section][key] === undefined) {
      return defaultValue;
    }
    
    return settings[section][key] as T;
  } catch (error) {
    console.error(`Error getting setting ${section}.${key}:`, error);
    return defaultValue;
  }
}

/**
 * Check if a feature is enabled in system settings
 * @param featureName Name of the feature to check (e.g., 'recommendations', 'history')
 * @returns Promise<boolean> True if the feature is enabled, false otherwise
 */
export async function isFeatureEnabled(featureName: string): Promise<boolean> {
  return await getSetting('features', featureName, false);
}

/**
 * Get content setting value
 * @param settingName Name of the content setting (e.g., 'defaultLanguage', 'adultContent')
 * @param defaultValue Default value if setting is not found
 * @returns Promise with the setting value
 */
export async function getContentSetting<T>(settingName: string, defaultValue: T): Promise<T> {
  return await getSetting('content', settingName, defaultValue);
} 