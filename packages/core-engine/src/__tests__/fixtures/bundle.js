import moment from 'moment';
import * as _ from 'lodash';

export function formatDate(d) {
  return moment(d).format('YYYY-MM-DD');
}
