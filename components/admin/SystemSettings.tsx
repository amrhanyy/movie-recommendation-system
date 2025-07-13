'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { AlertCircle, Check, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface SystemConfig {
  features: {
    aiAssistant: boolean;
  };
}

export function SystemSettings() {
  const [config, setConfig] = useState<SystemConfig>({
    features: {
      aiAssistant: true,
    }
  });
  
  const [originalConfig, setOriginalConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  useEffect(() => {
    fetchSettings();
  }, []);
  
  // Check if settings have been changed
  const hasChanges = React.useMemo(() => {
    if (!originalConfig) return false;
    return JSON.stringify(config) !== JSON.stringify(originalConfig);
  }, [config, originalConfig]);
  
  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/admin/settings');
      
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      
      const data = await response.json();
      
      if (data.config) {
        // Create copy of config to track changes
        setConfig(data.config);
        setOriginalConfig(JSON.parse(JSON.stringify(data.config)));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setError('Failed to load system settings. Please try again later.');
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };
  
  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);
      
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save settings');
      }
      
      const result = await response.json();
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      setSaveSuccess(true);
      toast.success('Settings saved successfully');
      
      // Update settings if server modified them
      if (result.config) {
        setConfig(result.config);
        setOriginalConfig(JSON.parse(JSON.stringify(result.config)));
      }
      
      // Reset success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setError('Failed to save settings. Please try again.');
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };
  
  const handleChange = (section: keyof SystemConfig, key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  };
  
  // Reset to original settings
  const handleReset = () => {
    if (originalConfig) {
      setConfig(JSON.parse(JSON.stringify(originalConfig)));
      toast.success('Settings reset to last saved state');
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          <span className="text-gray-300">Loading settings...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">System Configuration</h2>
          {hasChanges && (
            <Badge className="bg-amber-600 text-white border-none">Unsaved Changes</Badge>
          )}
          {saveSuccess && (
            <Badge className="bg-green-600 text-white border-none">
              <Check className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Button 
              variant="outline" 
              onClick={handleReset} 
              disabled={saving || !hasChanges}
              className="bg-gray-800/50 border-gray-700 hover:bg-gray-700 text-gray-300"
            >
              Reset
            </Button>
          )}
          <Button 
            onClick={saveSettings} 
            disabled={saving || !hasChanges}
            className={`
              ${saving ? 'bg-gray-700' : hasChanges ? 'bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400' : 'bg-gray-700'} 
              text-white shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5
            `}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
      
      {error && (
        <Alert variant="destructive" className="bg-red-900/50 border-red-700 text-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <Card className="bg-gray-800/30 backdrop-blur-sm border-gray-700/50 shadow-xl shadow-cyan-900/5 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"></div>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <Sparkles className="h-5 w-5 text-blue-400" />
            </div>
            <CardTitle className="text-white">Feature Management</CardTitle>
          </div>
          <CardDescription className="text-gray-400">
            Enable or disable system features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="ai-assistant" className="text-gray-300">AI Assistant</Label>
                <p className="text-sm text-gray-400">
                  Enable AI-powered movie recommendations assistant
                </p>
              </div>
              <Switch
                id="ai-assistant"
                checked={config.features.aiAssistant}
                onCheckedChange={(checked) => handleChange('features', 'aiAssistant', checked)}
                className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-600 data-[state=checked]:to-cyan-500"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-gray-900/30 border-t border-gray-700/50 py-3 px-6">
          <div className="text-xs text-gray-400">
            <span className="text-cyan-400">Note:</span> Feature changes may require a system restart to fully apply
          </div>
        </CardFooter>
      </Card>
    </div>
  );
} 