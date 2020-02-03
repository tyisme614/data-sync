import { Application } from 'egg';

export default (app: Application) => {
  // app.context.egg-datacache.test();
  // console.log('app:' + app.toJSON());
  const { controller, router } = app;

  router.get('/', controller.home.index);
};
