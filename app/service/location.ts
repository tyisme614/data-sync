import { Service } from 'egg';
import AddressParser = require('parse-address-cn');
import leven from 'leven';

export default class LocationService extends Service {

  private dataCache = new Map();
  private STRING_SIMILARITY_LEVEL = 0.9;
  private debug = false;

  public async retrieveCoordinateViaGD(address) {
    const { config, logger } = this.ctx.app;
    const gaode_geoservice_url = 'https://restapi.amap.com/v3/geocode/geo?address=' + address + '&output=json&key=' + config.gaode.api_key;

    const response = await this.ctx.curl(gaode_geoservice_url, {
      // parse JSON response
      dataType: 'json',
      // timeout of 3s
      timeout: 3000,
    });

    // process response
    if (typeof (response.data) !== 'undefined') {

      const raw_data = response.data;
      if (raw_data.status === '1') {
        try {
          const code = 200;
          const count = raw_data.count;
          const list = new Array<PlaceInfo>();// contains matched results
          for (let i = 0; i < raw_data.count; i++) {
            const geo = raw_data.geocodes[i];
            const _province = geo.province;
            const _city = geo.city;
            const _district = geo.district;
            const location = geo.location;
            const raw_str = location.split(',');
            let lon = 0,
              lat = 0;
            if (raw_str.length >= 2) {
              lon = raw_str[0];
              lat = raw_str[1];
            }

            const place_info = {
              addr: address,
              province: _province,
              city: _city,
              district: _district,
              longitude: lon,
              latitude: lat,
            };

            list.push(place_info);
            const addr_obj = AddressParser.parseAddress(address);
            if (typeof (addr_obj.name) !== 'undefined' && addr_obj.name !== '' && !this.dataCache.has(addr_obj.name)) {
              // cache data
              // note: only the first data in the list would be cached
              if (this.debug) { console.log('addr_obj=' + JSON.stringify(addr_obj)); }
              this.dataCache.set(_province + _city + addr_obj.name, place_info);
            }
          }
          const result = {
            code,
            count,
            list,
          };
          return result;

        } catch (e) {
          logger.error('encountered error while parsing response data, msg:' + e.toString());
          return null;
        }
      } else {

        const result = {
          code: 500,
          msg: 'encountered error while requesting geocoding service from Gaode Map Engine, msg:' + response.toString(),
        };
        return result;
      }
    }


  }

  /**
   * get location object from cache
   * @param addr
   * @return {PlaceInfo}
   */
  public getLocationFromCache(addr) {
    if (this.dataCache.has(addr)) {
      return this.dataCache.get(addr);
    }
    // traverse key list of data cache to find similar addresses
    // use 'leven' to compare address strings.
    // similarity level larger than STRING_SIMILARITY_LEVEL should be considered as similar addresses.
    // use 'parse-address-cn' to parse plain address string
    const addr_obj = AddressParser.parseAddress(addr);
    const addr_detail = addr_obj.name;// omit province and city, only compare detail address
    const keys = this.dataCache.keys();
    for (const k of keys) {
      if (this.compareAddressStrings(addr_detail, k)) {
        return this.dataCache.get(k);
      }
      continue;

    }

    return null;


  }

  private compareAddressStrings(str1, str2) {
    const len = str1.length > str2.length ? str1.length : str2.length;
    const match_index = leven(str1, str2) * 1.0;
    const ratio = match_index / len;
    if (ratio >= this.STRING_SIMILARITY_LEVEL) {
      return true;
    }
    return false;

  }

}

type PlaceInfo = {
  addr: string;
  province: string;
  city: string;
  district: string;
  longitude: number;
  latitude: number;
};
