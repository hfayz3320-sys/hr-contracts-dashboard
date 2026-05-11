export const isDev = import.meta.env.DEV;
export const isProd = import.meta.env.PROD;
export const envLabel: 'DEV' | 'PROD' = isProd ? 'PROD' : 'DEV';
export const appName = 'HR Contracts Dashboard V2';
export const appVersion = '0.1.0';
