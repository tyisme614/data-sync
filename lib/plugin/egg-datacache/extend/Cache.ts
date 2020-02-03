export class Cache {

  private _container;

  constructor() {
    this._container = new Map();
  }

  public getDatabyKey(k) {
    return this._container.get(k);
  }

  public setData(k, d) {
    this._container.set(k, d);
  }

  public getContainer() {
    return this._container;
  }
}
