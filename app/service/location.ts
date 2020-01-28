import { Service } from 'egg';


export default class LocationService extends Service {


    public async retrieveCoordinateViaGD(address) {
        const { config, logger } = this.ctx.app;
        const gaode_geoservice_url = 'https://restapi.amap.com/v3/geocode/geo?address=' + address + '&output=json&key=' + config.gaode.api_key;


        // example: request a npm module's info
        const response = await this.ctx.curl(gaode_geoservice_url, {
            // parse JSON response
            dataType: 'json',
            // timeout of 3s
            timeout: 3000,
        });

        // process response


        if (response.status === 200) {
            logger.debug('finished address conversion');
            let json;

            try {
                json = response.data;

                const code = 200;
                const count = json.count;
                const list = new Array<PlaceInfo>();// contains matched results
                for (let i = 0; i < json.count; i++) {
                    const geo = json.geocodes[i];
                    const city = geo.city;
                    const location = geo.location;
                    const raw_str = location.split(',');
                    let lon = 0,
                        lat = 0;
                    if (raw_str.length >= 2) {
                        lon = raw_str[0];
                        lat = raw_str[1];
                    }


                    list.push({
                        city,
                        longitude: lon,
                        latitude: lat,
                    });


                }
                const result = {
                    code,
                    count,
                    list,
                };
                return result;

            } catch (e) {
                logger.error('encountered error while parsing response data');
                return null;
            }


        } else {

            const result = {
                code: 500,
                msg: 'encountered error while requesting geocoding service from Gaode Map Engine',
            };
            return result;
        }


    }


}

type PlaceInfo = {
    city: string;
    longitude: number;
    latitude: number;
};
