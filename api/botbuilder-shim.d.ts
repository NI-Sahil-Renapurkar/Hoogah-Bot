// Minimal Bot Framework adapter typings for local type-check in this repo.
// At runtime, the real `botbuilder` package provides full implementations.
declare module "botbuilder" {
  export interface TurnContext {
    activity: any;
    sendActivity(activity: any): Promise<any>;
  }

  export class ConfigurationServiceClientCredentialFactory {
    constructor(options: Record<string, any>);
  }

  export class CloudAdapter {
    constructor(credFactory: ConfigurationServiceClientCredentialFactory);
    onTurnError?: (context: TurnContext, error: any) => Promise<void>;
    process(
      req: any,
      res: any,
      logic: (context: TurnContext) => Promise<void>
    ): Promise<void>;
    processActivity(
      req: any,
      res: any,
      logic: (context: TurnContext) => Promise<void>
    ): Promise<void>;
  }
}

