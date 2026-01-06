export interface SettingField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  defaultValue: any;
  label: string;
  description?: string;
  validation?: (value: any) => boolean;
}

export interface SettingsSchema {
  category: string;
  fields: SettingField[];
  validationRules?: ValidationRule[];
}

export interface ValidationRule {
  rule: (value: any) => boolean;
  errorMessage: string;
}

export interface UserActivity {
  filtersUsed: string[];
  filterUseRate: number;
  lastActive: Date;
  featureUsage: {
    [feature: string]: number;
  };
}
