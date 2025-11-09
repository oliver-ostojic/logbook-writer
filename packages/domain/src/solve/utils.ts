let _counter = 0;
export const genId = (prefix = '') => `${prefix}${Date.now().toString(36)}${(_counter++).toString(36)}`;
