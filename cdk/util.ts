import {App} from "aws-cdk-lib";

export const tryGetContext = (app: App, context: string) => {
    const value = app.node.tryGetContext(context);
    if (!value) throw new Error(`Context -c ${context} is missing.`);
    return value;
}

export const isProduction = (env: string) => env === 'production';
