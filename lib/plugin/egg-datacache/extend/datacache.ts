import { Cache } from './Cache';

function initialize() {
  console.log('initializing singleton');
  // console.log(config.toString());

  const c = new Cache();
  c.setData('test', 'hello world!');
  return c;
}

export default function(app) {
  // app.beforeStart(async() => {
  //   console.log('initialize plugin...');
  //   _Cache_Map = new Map();
  //   _Cache_Map.set('info', 'this map is used for caching data for all components');
  // });
  console.log('app baseDir of plugin egg-datacache.ts --> ' + app.type);
  app.addSingleton('datacache', initialize);
  const str = app.datacache.getDatabyKey('test');
  console.log('output from plugin app.ts-->' + str);
}
