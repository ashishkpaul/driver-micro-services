import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DispatchConfig, ConfigType, ConfigScope } from "./entities/dispatch-config.entity";

@Injectable()
export class DispatchConfigService {
  private readonly logger = new Logger(DispatchConfigService.name);

  // Default configuration values
  private readonly DEFAULT_CONFIGS = {
    [ConfigType.SCORING_WEIGHTS]: {
      completionRate: 0.4,
      timing: 0.3,
      quality: 0.3,
    },
    [ConfigType.THRESHOLDS]: {
      minimumScore: 50,
      minimumAssignments: 5,
    },
    [ConfigType.DECAY_SETTINGS]: {
      baseDecay: 0.95,
      maxDecayDays: 30,
    },
    [ConfigType.ROLLOUT_SETTINGS]: {
      scoringEnabled: false,
      rolloutPercentage: 0,
      abTestGroups: {
        control: 50,
        scoring: 50,
      },
    },
  };

  constructor(
    @InjectRepository(DispatchConfig)
    private readonly dispatchConfigRepository: Repository<DispatchConfig>,
  ) {}

  /**
   * Get configuration value for a specific type and scope
   */
  async getConfig(configType: ConfigType, driverId?: string): Promise<any> {
    try {
      // Try to find specific configuration for the driver
      if (driverId) {
        const specificConfig = await this.dispatchConfigRepository.findOne({
          where: {
            configType,
            configScope: ConfigScope.DRIVER_TYPE,
            scopeValue: driverId,
            isActive: true,
          },
          order: { version: "DESC" },
        });

        if (specificConfig) {
          return specificConfig.configValue;
        }
      }

      // Try to find global configuration
      const globalConfig = await this.dispatchConfigRepository.findOne({
        where: {
          configType,
          configScope: ConfigScope.GLOBAL,
          isActive: true,
        },
        order: { version: "DESC" },
      });

      if (globalConfig) {
        return globalConfig.configValue;
      }

      // Return default configuration
      return this.DEFAULT_CONFIGS[configType];
    } catch (error) {
      this.logger.error(`Failed to get config for ${configType}:`, error);
      return this.DEFAULT_CONFIGS[configType];
    }
  }

  /**
   * Set configuration value
   */
  async setConfig(
    configType: ConfigType,
    configKey: string,
    configValue: any,
    scope?: { scope: ConfigScope; value?: string },
    description?: string,
  ): Promise<DispatchConfig> {
    try {
      // Check if configuration already exists
      const existingConfig = await this.dispatchConfigRepository.findOne({
        where: {
          configType,
          configKey,
          configScope: scope?.scope || ConfigScope.GLOBAL,
          scopeValue: scope?.value,
        },
        order: { version: "DESC" },
      });

      const newVersion = existingConfig ? existingConfig.version + 1 : 1;

      const config = this.dispatchConfigRepository.create({
        configType,
        configScope: scope?.scope || ConfigScope.GLOBAL,
        scopeValue: scope?.value || undefined,
        configKey,
        configValue,
        version: newVersion,
        isActive: true,
        description: description || `Configuration for ${configType}.${configKey}`,
      });

      const savedConfig = await this.dispatchConfigRepository.save(config);
      this.logger.log(`Configuration updated: ${configType}.${configKey} v${newVersion}`);
      
      return savedConfig;
    } catch (error) {
      this.logger.error(`Failed to set config for ${configType}.${configKey}:`, error);
      throw new BadRequestException(`Failed to update configuration: ${error.message}`);
    }
  }

  /**
   * Get all configurations for a specific type
   */
  async getAllConfigs(configType: ConfigType): Promise<DispatchConfig[]> {
    return await this.dispatchConfigRepository.find({
      where: {
        configType,
        isActive: true,
      },
      order: { configKey: "ASC", version: "DESC" },
    });
  }

  /**
   * Get active rollout percentage for scoring
   */
  async getRolloutPercentage(): Promise<number> {
    const config = await this.getConfig(ConfigType.ROLLOUT_SETTINGS);
    return config?.rolloutPercentage || 0;
  }

  /**
   * Check if scoring is enabled
   */
  async isScoringEnabled(): Promise<boolean> {
    const config = await this.getConfig(ConfigType.ROLLOUT_SETTINGS);
    return config?.scoringEnabled || false;
  }

  /**
   * Update rollout settings
   */
  async updateRolloutSettings(settings: {
    scoringEnabled?: boolean;
    rolloutPercentage?: number;
    abTestGroups?: { control: number; scoring: number };
  }): Promise<DispatchConfig> {
    const currentConfig = await this.getConfig(ConfigType.ROLLOUT_SETTINGS);
    const updatedConfig = { ...currentConfig, ...settings };

    return await this.setConfig(
      ConfigType.ROLLOUT_SETTINGS,
      "rollout_settings",
      updatedConfig,
      { scope: ConfigScope.GLOBAL },
      "Rollout settings for scoring system",
    );
  }

  /**
   * Get configuration history
   */
  async getConfigHistory(configType: ConfigType, configKey?: string): Promise<DispatchConfig[]> {
    const where: any = { configType };
    if (configKey) {
      where.configKey = configKey;
    }

    return await this.dispatchConfigRepository.find({
      where,
      order: { version: "DESC", updatedAt: "DESC" },
    });
  }

  /**
   * Deactivate old configuration version
   */
  async deactivateConfig(configId: string): Promise<void> {
    const config = await this.dispatchConfigRepository.findOne({
      where: { id: configId },
    });

    if (!config) {
      throw new NotFoundException(`Configuration not found: ${configId}`);
    }

    config.isActive = false;
    await this.dispatchConfigRepository.save(config);
    this.logger.log(`Configuration deactivated: ${config.configType}.${config.configKey} v${config.version}`);
  }

  /**
   * Get configuration summary for monitoring
   */
  async getConfigSummary(): Promise<{
    totalConfigs: number;
    activeConfigs: number;
    configTypes: Record<string, number>;
    lastUpdated: Date | null;
  }> {
    const totalConfigs = await this.dispatchConfigRepository.count();
    const activeConfigs = await this.dispatchConfigRepository.count({
      where: { isActive: true },
    });

    const configTypes = await this.dispatchConfigRepository
      .createQueryBuilder("config")
      .select("config.configType", "type")
      .addSelect("COUNT(*)", "count")
      .where("config.isActive = :active", { active: true })
      .groupBy("config.configType")
      .getRawMany();

    const typeCounts: Record<string, number> = {};
    configTypes.forEach(item => {
      typeCounts[item.type] = parseInt(item.count);
    });

    const lastUpdatedResult = await this.dispatchConfigRepository
      .createQueryBuilder("config")
      .select("MAX(config.updatedAt)", "lastUpdated")
      .getRawOne();

    return {
      totalConfigs,
      activeConfigs,
      configTypes: typeCounts,
      lastUpdated: lastUpdatedResult?.lastUpdated || null,
    };
  }
}