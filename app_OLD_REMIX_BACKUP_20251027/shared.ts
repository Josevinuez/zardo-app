const shared_config = {
  prefix: "bq",
  stallInterval: 5000,
  nearTermWindow: 1200000,
  delayedDebounce: 1000,
  redis: {
    host: "127.0.0.1",
    port: 6379,
    db: 0,
    options: {},
  },
  isWorker: true,
  getEvents: true,
  sendEvents: true,
  storeJobs: false,
  ensureScripts: true,
  activateDelayedJobs: true,
  removeOnSuccess: true,
  removeOnFailure: false,
  autoConnect: true,
};

export { shared_config };
