// Template: Globe lab. A drawn Earth (orthographic globe and flat map, no images, no library) for latitude and
// longitude, day and night with local time, standard time zones and the Indian Standard Time, heat zones, the eight
// directions, and distance with map scale. The geography is computed, not scripted: great-circle distance and bearing,
// 15 degrees = 1 hour, IST at 82 deg 30 min E (UTC+5:30), heat zones at 23.5 and 66.5 degrees. Config:
//   { mode: 'grid' | 'time' | 'zones' | 'directions' | 'scale', place?: <place id> }
// grid: place = the place the child must find; time: the place whose time is read; zones: the place first shown;
// directions and scale: the home place (an Indian city for directions). Default home: Delhi.
(function () {
  const L = window.NCA_LIB;
  const { esc, tween } = L;
  const T2 = (en, hi) => ({ en, hi });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RAD = Math.PI / 180;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const MODES = ['grid', 'time', 'zones', 'directions', 'scale'];
  const n1 = (v) => Math.round(v * 10) / 10;

  // ---------------------------------------------------------------- places (real coordinates; offset = standard time, minutes from UTC)
  const P = {};
  const addP = (id, en, hi, lat, lon, off, ind) => { P[id] = { id, n: T2(en, hi), lat, lon, off, in: !!ind }; };
  addP('delhi', 'Delhi', 'दिल्ली', 28.61, 77.21, 330, 1);
  addP('mumbai', 'Mumbai', 'मुंबई', 19.08, 72.88, 330, 1);
  addP('kolkata', 'Kolkata', 'कोलकाता', 22.57, 88.36, 330, 1);
  addP('chennai', 'Chennai', 'चेन्नई', 13.08, 80.27, 330, 1);
  addP('bengaluru', 'Bengaluru', 'बेंगलुरु', 12.97, 77.59, 330, 1);
  addP('hyderabad', 'Hyderabad', 'हैदराबाद', 17.39, 78.49, 330, 1);
  addP('jaipur', 'Jaipur', 'जयपुर', 26.91, 75.79, 330, 1);
  addP('lucknow', 'Lucknow', 'लखनऊ', 26.85, 80.95, 330, 1);
  addP('patna', 'Patna', 'पटना', 25.59, 85.14, 330, 1);
  addP('bhopal', 'Bhopal', 'भोपाल', 23.26, 77.41, 330, 1);
  addP('ahmedabad', 'Ahmedabad', 'अहमदाबाद', 23.02, 72.57, 330, 1);
  addP('guwahati', 'Guwahati', 'गुवाहाटी', 26.14, 91.74, 330, 1);
  addP('thiruvananthapuram', 'Thiruvananthapuram', 'तिरुवनंतपुरम', 8.52, 76.94, 330, 1);
  addP('srinagar', 'Srinagar', 'श्रीनगर', 34.08, 74.8, 330, 1);
  addP('shimla', 'Shimla', 'शिमला', 31.1, 77.17, 330, 1);
  addP('leh', 'Leh', 'लेह', 34.16, 77.58, 330, 1);
  addP('port_blair', 'Port Blair', 'पोर्ट ब्लेयर', 11.62, 92.73, 330, 1);
  addP('kanyakumari', 'Kanyakumari', 'कन्याकुमारी', 8.08, 77.54, 330, 1);
  addP('amritsar', 'Amritsar', 'अमृतसर', 31.63, 74.87, 330, 1);
  addP('panaji', 'Panaji', 'पणजी', 15.5, 73.83, 330, 1);
  addP('mirzapur', 'Mirzapur', 'मिर्ज़ापुर', 25.15, 82.58, 330, 1);
  addP('itanagar', 'Itanagar', 'ईटानगर', 27.08, 93.62, 330, 1);
  addP('greenwich', 'Greenwich', 'ग्रीनविच', 51.48, 0, 0, 0);
  addP('london', 'London', 'लंदन', 51.51, -0.13, 0, 0);
  addP('reykjavik', 'Reykjavik', 'रेक्जाविक', 64.15, -21.94, 0, 0);
  addP('accra', 'Accra', 'अक्करा', 5.6, -0.19, 0, 0);
  addP('paris', 'Paris', 'पेरिस', 48.86, 2.35, 60, 0);
  addP('lagos', 'Lagos', 'लागोस', 6.52, 3.38, 60, 0);
  addP('cairo', 'Cairo', 'काहिरा', 30.04, 31.24, 120, 0);
  addP('cape_town', 'Cape Town', 'केप टाउन', -33.92, 18.42, 120, 0);
  addP('nairobi', 'Nairobi', 'नैरोबी', -1.29, 36.82, 180, 0);
  addP('moscow', 'Moscow', 'मॉस्को', 55.76, 37.62, 180, 0);
  addP('dubai', 'Dubai', 'दुबई', 25.2, 55.27, 240, 0);
  addP('karachi', 'Karachi', 'कराची', 24.86, 67.01, 300, 0);
  addP('colombo', 'Colombo', 'कोलंबो', 6.93, 79.86, 330, 0);
  addP('kathmandu', 'Kathmandu', 'काठमांडू', 27.72, 85.32, 345, 0);
  addP('dhaka', 'Dhaka', 'ढाका', 23.81, 90.41, 360, 0);
  addP('bangkok', 'Bangkok', 'बैंकॉक', 13.76, 100.5, 420, 0);
  addP('beijing', 'Beijing', 'बीजिंग', 39.9, 116.41, 480, 0);
  addP('singapore', 'Singapore', 'सिंगापुर', 1.35, 103.82, 480, 0);
  addP('tokyo', 'Tokyo', 'टोक्यो', 35.68, 139.69, 540, 0);
  addP('sydney', 'Sydney', 'सिडनी', -33.87, 151.21, 600, 0);
  addP('auckland', 'Auckland', 'ऑकलैंड', -36.85, 174.76, 720, 0);
  addP('honolulu', 'Honolulu', 'होनोलूलू', 21.31, -157.86, -600, 0);
  addP('anchorage', 'Anchorage', 'एंकरेज', 61.22, -149.9, -540, 0);
  addP('los_angeles', 'Los Angeles', 'लॉस एंजिलिस', 34.05, -118.24, -480, 0);
  addP('new_york', 'New York', 'न्यूयॉर्क', 40.71, -74.01, -300, 0);
  addP('quito', 'Quito', 'क्विटो', -0.18, -78.47, -300, 0);
  addP('rio', 'Rio de Janeiro', 'रियो डी जनेरो', -22.91, -43.17, -180, 0);

  const CHIPS = {
    grid: ['delhi', 'mumbai', 'kolkata', 'chennai', 'kanyakumari', 'srinagar', 'quito', 'london', 'new_york', 'sydney', 'cape_town'],
    time: ['london', 'delhi', 'dubai', 'tokyo', 'new_york', 'sydney', 'los_angeles', 'moscow'],
    zones: ['delhi', 'london', 'dubai', 'kathmandu', 'beijing', 'tokyo', 'sydney', 'new_york', 'los_angeles', 'cairo'],
    scale: ['delhi', 'mumbai', 'kolkata', 'chennai', 'kanyakumari', 'srinagar', 'london', 'tokyo', 'new_york', 'sydney'],
  };
  const DIRCITIES = ['delhi', 'mumbai', 'kolkata', 'chennai', 'jaipur', 'guwahati', 'srinagar', 'thiruvananthapuram', 'bhopal', 'patna'];
  const homeOf = (place) => (place && has(P, place) ? place : 'delhi');
  function chipsFor(mode, place) {
    if (mode === 'directions') { const h = homeOf(place); return DIRCITIES.filter((i) => i !== h); }
    if (mode === 'scale') { const h = homeOf(place); return CHIPS.scale.filter((i) => i !== h); }
    const l = (CHIPS[mode] || []).slice();
    if (place && has(P, place) && !l.includes(place)) l.unshift(place);
    return l;
  }
  const SCALES = [10, 100, 500, 1000, 2000];

  // ---------------------------------------------------------------- simplified outlines [lon, lat] (hand-drawn from school atlas shapes)
  const EAST = [[89.0, 22.0], [88.2, 21.7], [87.0, 21.5], [86.7, 20.3], [85.5, 19.8], [84.5, 18.8], [83.3, 17.5], [82.3, 16.5], [81.2, 16.0], [80.1, 15.2], [80.3, 13.5], [79.9, 12.0], [79.8, 10.3], [79.3, 9.2], [78.2, 8.9], [77.55, 8.1]];
  const WEST = [[76.6, 8.9], [76.2, 9.9], [75.5, 11.8], [74.8, 13.0], [74.0, 14.9], [73.7, 16.3], [73.0, 17.8], [72.8, 19.3], [72.7, 20.6], [72.9, 21.2], [72.6, 22.2], [72.2, 21.2], [70.8, 20.8], [69.0, 22.3], [70.0, 22.9], [68.6, 23.2], [68.2, 23.7]];
  const BORDER = [[68.2, 23.8], [69.4, 24.3], [70.1, 24.4], [70.9, 24.9], [71.0, 25.8], [70.3, 26.9], [70.1, 27.8], [71.0, 28.4], [72.4, 28.8], [73.2, 29.8], [74.4, 30.2], [74.8, 31.1], [74.5, 32.0], [75.2, 32.5], [74.6, 33.3], [74.1, 34.3], [73.4, 35.3], [72.9, 36.0], [73.3, 36.9], [74.5, 37.0], [75.6, 36.9], [76.9, 35.9], [77.8, 35.5], [78.9, 34.6], [79.9, 34.8], [80.2, 35.5], [79.5, 33.8], [79.4, 32.9], [78.7, 32.3], [78.5, 31.8], [78.8, 31.0], [79.1, 30.7], [80.1, 30.4], [80.2, 29.2], [80.6, 28.7], [81.4, 28.3], [82.1, 27.9], [83.3, 27.4], [84.1, 27.4], [85.0, 26.9], [86.0, 26.6], [87.3, 26.4], [88.1, 26.55], [88.1, 27.1], [88.4, 27.9], [88.9, 28.1], [88.85, 27.3], [88.9, 26.9], [89.6, 26.7], [90.3, 26.8], [91.5, 26.8], [91.7, 27.3], [92.1, 27.8], [92.9, 27.9], [93.8, 28.7], [94.6, 29.3], [95.5, 29.3], [96.1, 29.4], [96.6, 28.6], [97.3, 28.2], [97.1, 27.3], [96.2, 27.2], [95.3, 26.7], [95.0, 26.0], [94.6, 25.2], [94.2, 24.6], [93.5, 24.0], [93.3, 23.1], [93.1, 22.3], [92.3, 22.8], [92.3, 23.8], [91.7, 24.2], [91.9, 24.9], [91.2, 25.2], [90.2, 25.2], [89.8, 25.6], [89.8, 26.1], [89.0, 26.25], [88.5, 26.3], [88.5, 25.8], [88.1, 25.2], [88.4, 24.4], [88.7, 24.2], [88.5, 23.3], [88.9, 23.1]];
  const INDIA = BORDER.concat(EAST, WEST);
  const EURASIA = [[-9, 37], [-9, 43], [-1.5, 43.5], [-4.5, 48.5], [2, 51], [5, 53.5], [8.5, 57], [10.5, 57.5], [10, 54.5], [14, 54], [19, 54.5], [21, 57], [24, 58], [28, 60], [23, 60], [21.5, 63], [25, 65.5], [21.5, 65.8], [17.5, 62.5], [18.5, 60], [16.5, 56.5], [13, 55.5], [11.5, 59], [5.5, 58.5], [5, 62], [11, 65], [15, 68.5], [20, 70], [26, 71], [31, 70], [41, 67], [33, 66], [40.5, 64.5], [44, 66], [54, 68.5], [60, 69], [68, 69], [66, 71], [73, 72.5], [80, 72.5], [88, 75.5], [100, 77], [104, 77.5], [113, 74], [128, 73], [140, 72.5], [150, 71.5], [160, 69.5], [170, 70], [180, 69], [180, 65], [179, 62.5], [164, 60], [163, 56], [156, 51], [155, 57], [150, 59.5], [143, 59], [137, 54.5], [141, 52], [140, 48], [135, 43], [131, 42.5], [129.5, 41], [127.5, 39.5], [129.5, 35.5], [126.5, 34.5], [126, 37.5], [125, 39.5], [121.5, 39], [118, 39], [119, 37], [122.5, 37], [120.5, 36], [119, 34], [121.5, 31.5], [122, 29.5], [119.5, 25.5], [116, 22.8], [110, 21], [108, 21.5], [106, 19], [109, 15], [109, 12], [106, 9], [105, 8.7], [105, 10], [100.5, 13.5], [100, 10], [103, 6], [104, 1.5], [101.5, 2.8], [100.5, 6], [98.5, 8], [98.5, 13], [97.5, 16.5], [94.5, 16], [94.2, 19], [92.3, 21.2], [91.8, 22.5]]
    .concat(EAST, WEST, [[67.2, 24.9], [66.5, 25.4], [62, 25], [57.5, 25.7], [56.5, 27], [54.5, 26.5], [51.5, 27.9], [50, 30], [48.5, 30], [48, 29.5], [50, 26.5], [51.5, 24.5], [54, 24], [56.3, 26.3], [56.5, 24.5], [58.8, 23.5], [59.8, 22.5], [57.7, 19], [55, 17], [52, 16], [48.5, 14], [45, 12.8], [43.3, 12.7], [42.8, 16], [39.5, 21.5], [37, 25.5], [35, 28], [34.9, 29.5], [34.3, 31.3], [35, 33], [36, 36.5], [32, 36.2], [28, 36.8], [26.5, 38.5], [26.5, 40], [29, 41], [28, 42.5], [24, 40.8], [22, 40], [23.5, 38], [22, 36.5], [20, 39.5], [19.5, 41.5], [15, 44.5], [13.5, 45.5], [12.3, 44.8], [14, 42.2], [16, 41.9], [18.5, 40.2], [16.5, 38.9], [15.7, 38], [15.8, 40], [12.5, 41.5], [10, 43.5], [8.5, 44.3], [6, 43], [3.2, 43.3], [3, 42], [0.5, 40.5], [-0.5, 38.5], [-2, 36.8], [-5.5, 36]]);
  const AFRICA = [[-5.9, 35.8], [-2, 35.2], [3, 36.8], [10, 37.2], [11, 35], [10, 33.5], [15, 32.3], [20, 32], [20, 30.5], [24, 32], [29, 30.9], [32.3, 31.3], [34.2, 31.3], [34.9, 29.5], [34.3, 27.8], [35.5, 24], [37.2, 21], [38.8, 16], [41, 14.5], [43.2, 12.4], [45, 10.5], [51.2, 11.8], [51, 10.4], [48, 5], [45, 2], [41, -2], [39.3, -4.8], [39, -7], [40.5, -10.5], [40.5, -15], [37, -18], [35, -20], [35.5, -24], [32.8, -26], [32.5, -28.5], [30, -31], [27, -33.5], [22, -34], [20, -34.8], [18.4, -34], [18, -31.5], [15, -27], [14.5, -22.5], [11.8, -17], [13.5, -12], [12, -6], [13.5, -4.5], [9.5, -1], [9.8, 3.5], [8.5, 4.5], [6, 4.3], [4, 6.3], [1.2, 6], [-2, 4.8], [-4.5, 5.2], [-7.5, 4.4], [-11, 6.8], [-13.2, 8.5], [-15, 11], [-16.7, 12.5], [-17.5, 14.7], [-16.2, 17], [-16.5, 20], [-17, 21], [-15, 25], [-13, 27.5], [-10, 29.5], [-9.8, 31], [-8.5, 33.3], [-6.8, 34.2]];
  const NAMERICA = [[-168, 65.5], [-162, 70.3], [-156.5, 71.3], [-141, 69.7], [-128, 70], [-115, 68], [-108, 68], [-96, 68.5], [-90, 69], [-85, 69.5], [-82, 67], [-86, 66], [-90, 64], [-93, 61], [-94.7, 59], [-92.5, 57.2], [-88, 56.5], [-82.3, 55.2], [-82, 52.9], [-79.5, 51.5], [-78.8, 54.5], [-77, 56.5], [-78, 58.5], [-77.5, 62], [-73, 62.3], [-70, 61], [-69.5, 59.2], [-65.5, 59.5], [-62, 57], [-61.5, 56], [-57, 54], [-55.7, 52], [-59.5, 50.2], [-66, 50.2], [-66, 49], [-64.5, 48.8], [-64, 46.5], [-61, 45.5], [-65.5, 43.5], [-67, 44.8], [-70, 43.7], [-70.5, 41.8], [-72, 41.2], [-74, 40.5], [-74, 39.2], [-75.5, 38], [-76, 36.9], [-75.5, 35.3], [-77.5, 34.5], [-79, 33], [-81, 31.5], [-81.3, 30], [-80, 27], [-80.3, 25.3], [-81.2, 25.2], [-82.7, 27.8], [-82.7, 29.2], [-84, 30], [-86.5, 30.4], [-89, 30.2], [-89.5, 29.2], [-91.5, 29.5], [-94, 29.5], [-97.2, 27.8], [-97.5, 25.5], [-97.7, 22], [-97.2, 20], [-96, 18.5], [-94.5, 18.1], [-92, 18.6], [-90.7, 19.5], [-90.4, 21], [-87, 21.5], [-87.5, 18.5], [-88.2, 16.5], [-87, 15.8], [-83.5, 15.2], [-83.5, 11], [-82.5, 9.6], [-80, 9.3], [-77.4, 8.6], [-78.5, 8.1], [-80, 7.3], [-82.8, 8.2], [-85.7, 10], [-87.5, 13], [-91.5, 14], [-94, 16], [-98, 16], [-101, 17.3], [-105.5, 20.2], [-105.4, 23], [-109.5, 26.5], [-112.7, 31.5], [-114.7, 31.7], [-114, 28], [-112, 25], [-110, 23], [-112, 24.8], [-114.5, 28], [-116, 30.5], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-122, 37], [-123.8, 39.5], [-124.3, 42.5], [-124, 46.2], [-124.7, 48.4], [-123, 48.3], [-125, 50], [-128, 52], [-130.5, 55.5], [-134, 58], [-138, 59], [-144, 60], [-148, 60.5], [-152, 59], [-154, 57.5], [-158, 56], [-162, 55], [-165, 54.7], [-157, 58.5], [-162, 58.7], [-165, 60.7], [-166, 62.5], [-161, 64.5]];
  const SAMERICA = [[-77.4, 8.6], [-75.5, 10.9], [-72, 12], [-71.5, 10.5], [-68, 10.5], [-64, 10.6], [-61, 10.5], [-60, 8.5], [-57, 6], [-52, 5], [-50, 1.5], [-50, 0], [-48, -1], [-44, -2.5], [-40, -3], [-35, -5.3], [-35, -9], [-39, -13.5], [-39, -18], [-41, -22], [-44, -23], [-48.5, -26], [-48.7, -28.5], [-52, -32], [-54, -34.5], [-57, -34.9], [-58.4, -34.3], [-57.5, -36.2], [-57, -38], [-62, -39], [-65, -41], [-63.5, -42.7], [-65.3, -45], [-67.5, -46.5], [-66, -48], [-69, -51], [-68.5, -52.5], [-65.5, -55], [-68.4, -54.3], [-71.5, -54], [-74, -52], [-75.5, -48], [-73.5, -44], [-73.8, -40], [-73.3, -37], [-71.6, -32], [-71.5, -28.5], [-70.3, -23], [-70.3, -18.4], [-75, -15], [-76.5, -13], [-79, -8], [-81.2, -5.5], [-80.2, -3], [-80.7, -1], [-79.9, 1.5], [-78.5, 2.5], [-77.5, 4], [-77.2, 7]];
  const AUSTRALIA = [[113.5, -22], [114, -26], [115, -29], [115, -33.5], [117.5, -35], [121, -33.8], [124, -33.8], [129, -31.6], [132, -32], [134, -32.7], [135.7, -34.8], [137.5, -33], [138, -35.5], [140, -37.9], [143.5, -38.8], [146.3, -39], [148.2, -37.8], [150, -37.4], [151.2, -33.9], [153.1, -30], [153.5, -28], [153, -25], [150.8, -22.5], [149, -20.5], [146.3, -19], [145.4, -15], [143.8, -14.3], [143.3, -11], [142.5, -10.7], [141.6, -13], [141.5, -17], [139.5, -17.5], [137, -15.8], [135.5, -14.8], [136.8, -12.2], [133, -11.3], [130.5, -12.4], [129.5, -14.8], [127.5, -14], [125, -14.5], [122.5, -17], [121, -19.5], [117, -20.7]];
  const ANTARCTICA = [[-180, -80], [-165, -78], [-150, -77], [-130, -74], [-100, -74], [-80, -73], [-68, -70], [-62, -65], [-58, -63.5], [-62, -69], [-72, -74], [-60, -80], [-45, -78], [-30, -77], [-15, -72], [0, -70], [20, -70], [40, -68], [60, -67.5], [75, -69], [90, -66], [110, -66], [130, -66], [145, -68], [160, -70.5], [170, -72], [180, -78], [180, -90], [-180, -90]];
  const GREENLAND = [[-73, 78], [-60, 82], [-30, 83.5], [-18, 81.5], [-20, 75], [-22, 70], [-26, 68], [-40, 65], [-43, 60], [-48, 61], [-53, 66], [-55, 70], [-58, 75], [-67, 76]];
  const ISLANDS = [
    [[-80, 73.5], [-72, 71], [-68, 70], [-62, 67], [-65, 63], [-72, 64], [-78, 64.5], [-74, 68], [-85, 70], [-90, 73.5]],
    [[-118, 72], [-104, 73], [-101, 69.5], [-114, 68.8]],
    [[-90, 80], [-75, 83], [-62, 82.2], [-76, 78.5], [-90, 76.5]],
    [[-24, 65.5], [-22, 66.4], [-15, 66.3], [-13.5, 65], [-18, 63.4], [-22.5, 63.8]],
    [[-5.5, 50], [1.5, 51], [1.7, 52.8], [-0.5, 54], [-2, 55.8], [-1.8, 57.6], [-3.5, 58.6], [-5, 58.6], [-6, 57], [-5.5, 55], [-3, 54.7], [-3.1, 53.4], [-4.8, 52.6], [-5.2, 51.7], [-3.5, 51.2]],
    [[-10, 51.7], [-6, 52.2], [-6, 54], [-5.6, 55.2], [-8.3, 55.2], [-10, 54]],
    [[130.9, 34], [133, 35.5], [136, 36], [137, 37.4], [139.5, 38.5], [140, 40.5], [141.5, 41.2], [142, 39.5], [141, 37], [140.8, 35.7], [138.8, 34.7], [136.8, 34.4], [135, 33.8], [132.5, 34]],
    [[140, 41.8], [141.5, 45.4], [145.5, 43.3], [143.2, 42], [141.5, 42.5]],
    [[129.7, 33.2], [131.5, 34], [131.9, 32.5], [130.2, 31.2], [129.7, 32.5]],
    [[79.8, 9.7], [81.2, 8.5], [81.9, 7], [81.2, 6.2], [80.2, 5.9], [79.7, 7.5]],
    [[95.3, 5.6], [98, 4.2], [100.5, 2], [103.7, -1], [106, -3], [105.8, -5.8], [104.5, -5.9], [101, -3], [98.7, 0], [97, 2.5]],
    [[105.2, -6.8], [108, -6.3], [111, -6.5], [114.5, -7.8], [114, -8.7], [108, -7.8], [106, -7.3]],
    [[109, 1.5], [111, 1.8], [113.5, 3.2], [116, 6.5], [117.7, 6], [119, 5], [118, 2], [117.8, 0.8], [116.5, -2], [116, -3.8], [114.5, -4], [112.8, -3.2], [110.5, -3], [110, -1.5], [108.8, 0.5]],
    [[119.5, -5.5], [120.5, -2.8], [119.8, 0.5], [121, 1.3], [125, 1.5], [123, 0.3], [121.5, -1], [122.5, -4.5], [121, -3], [120.5, -5.5]],
    [[131, -0.8], [134.5, -0.5], [138, -1.7], [141, -2.6], [145, -4.5], [147.5, -6], [147.5, -8], [150.5, -10.4], [147, -10], [143.5, -8.8], [141, -9.2], [138, -8.3], [137.8, -5], [133, -4], [132.5, -2.5]],
    [[120.5, 18.5], [122.2, 18.3], [122, 16], [124, 13], [121.5, 13.8], [120.5, 14.5], [120, 16]],
    [[122, 7], [125.5, 9.5], [126.5, 7], [125.5, 5.8], [123.5, 7.5]],
    [[49.3, -12], [50.5, -15.5], [49.3, -18], [47.1, -24.8], [45, -25.5], [43.7, -23], [44.5, -19.5], [44, -17], [46.5, -15.7]],
    [[120.1, 23], [121.5, 25.2], [122, 24.5], [120.8, 22]],
    [[144.7, -40.7], [148.3, -40.9], [148, -43], [146, -43.6], [145, -42.2]],
    [[172.7, -34.5], [175.5, -37], [178.5, -37.7], [176, -41.5], [174.8, -41], [173.8, -39.2]],
    [[172.7, -40.5], [174.3, -41.7], [172.5, -43.7], [170.5, -46.3], [166.5, -46], [168.5, -44], [171, -42]],
  ];
  const ANDAMAN = [[[92.7, 13.6], [93.1, 13.2], [92.9, 11.8], [92.8, 10.6], [92.5, 12]], [[93.6, 8.1], [93.9, 7.2], [93.7, 6.8], [93.5, 7.6]]];
  const SEAS = [
    [[28, 41.2], [31, 41.2], [35, 42], [38, 41], [41.5, 41.5], [40, 43.5], [37, 45], [33, 44.5], [30, 46], [28, 44]],
    [[47, 45], [50, 46.5], [53, 45], [53.5, 41], [54, 37], [52, 36.7], [49, 38], [49.5, 40.5], [47.5, 43]],
  ];
  const LAND = [
    { c: EURASIA }, { c: AFRICA }, { c: NAMERICA }, { c: SAMERICA }, { c: AUSTRALIA }, { c: ANTARCTICA, ice: 1 }, { c: GREENLAND, ice: 1 },
  ].concat(ISLANDS.map((c) => ({ c })));
  // India is drawn on top in its own colour; the Andaman and Nicobar islands too.
  const INDIA_SHAPES = [INDIA].concat(ANDAMAN);

  // ---------------------------------------------------------------- facts and formulas
  const R_EARTH = 6371;
  const norm180 = (x) => ((((x + 180) % 360) + 360) % 360) - 180;
  const norm360 = (x) => ((x % 360) + 360) % 360;
  function distKm(a, b) {
    const p1 = a.lat * RAD, p2 = b.lat * RAD, dp = p2 - p1, dl = (b.lon - a.lon) * RAD;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
    return norm360(Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / RAD);
  }
  const sectorOf = (b) => Math.round(norm360(b) / 45) % 8;
  const sectorMargin = (b) => { const m = (norm360(b) + 22.5) % 45; return Math.min(m, 45 - m); };
  const DIRS = [
    { s: 'N', hs: 'उ', n: T2('north', 'उत्तर') }, { s: 'NE', hs: 'उ-पू', n: T2('north-east', 'उत्तर-पूर्व') },
    { s: 'E', hs: 'पू', n: T2('east', 'पूर्व') }, { s: 'SE', hs: 'द-पू', n: T2('south-east', 'दक्षिण-पूर्व') },
    { s: 'S', hs: 'द', n: T2('south', 'दक्षिण') }, { s: 'SW', hs: 'द-प', n: T2('south-west', 'दक्षिण-पश्चिम') },
    { s: 'W', hs: 'प', n: T2('west', 'पश्चिम') }, { s: 'NW', hs: 'उ-प', n: T2('north-west', 'उत्तर-पश्चिम') },
  ];
  // Great-circle points between two places (for the measuring arc).
  function arcPoints(a, b, step) {
    const v = (p) => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];
    const A = v(a), B = v(b);
    const w = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
    const n = Math.max(2, Math.ceil(w / RAD / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const s1 = w < 1e-6 ? 1 - f : Math.sin((1 - f) * w) / Math.sin(w), s2 = w < 1e-6 ? f : Math.sin(f * w) / Math.sin(w);
      const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
      out.push([Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD]);
    }
    return out;
  }

  // ---------------------------------------------------------------- words and number formats
  const inr = (n) => { const s = String(Math.round(n)); if (s.length <= 3) return s; return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3); };
  const dm = (v) => { const a = Math.abs(v); return Math.floor(a) + '°' + (a % 1 ? '30′' : ''); };
  const d1 = (v) => n1(Math.abs(v)) + '°';
  const latT = (v, f) => { const s = (f || dm)(v); return v === 0 ? T2('0°', '0°') : T2(`${s} ${v < 0 ? 'S' : 'N'}`, `${s} ${v < 0 ? 'दक्षिण' : 'उत्तर'}`); };
  const lonT = (v, f) => { const s = (f || dm)(v); return v === 0 || Math.abs(v) === 180 ? T2(s, s) : T2(`${s} ${v < 0 ? 'W' : 'E'}`, `${s} ${v < 0 ? 'पश्चिम' : 'पूर्व'}`); };
  const posT = (lat, lon, f) => { const a = latT(lat, f), b = lonT(lon, f); return T2(`${a.en}, ${b.en}`, `${a.hi}, ${b.hi}`); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (m) => { m = ((m % 1440) + 1440) % 1440; return pad2(Math.floor(m / 60)) + ':' + pad2(Math.floor(m % 60)); };
  function clockT(m) {
    m = Math.floor(((m % 1440) + 1440) % 1440);
    const h = Math.floor(m / 60), mi = m % 60, h12 = h % 12 === 0 ? 12 : h % 12, mm = pad2(mi);
    const per = h >= 4 && h < 12 ? 'सुबह' : h >= 12 && h < 16 ? 'दोपहर' : h >= 16 && h < 20 ? 'शाम' : 'रात';
    return T2(`${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`, `${per} ${h12}:${mm} बजे`);
  }
  const offT = (off) => { const s = off < 0 ? '−' : '+', a = Math.abs(off), h = Math.floor(a / 60), m = a % 60; return `UTC${s}${h}${m ? ':' + pad2(m) : ''}`; };
  const durT = (min) => { const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return T2(`${h} h${m ? ' ' + m + ' min' : ''}`, `${h} घंटे${m ? ' ' + m + ' मिनट' : ''}`); };
  const dayRel = (utc, off) => Math.floor((utc + off) / 1440);
  const DAYT = { '-1': T2('previous day', 'पिछला दिन'), 0: T2('same day', 'वही दिन'), 1: T2('next day', 'अगला दिन') };
  const heatOf = (lat) => (Math.abs(lat) < 23.5 ? 'torrid' : Math.abs(lat) <= 66.5 ? 'temperate' : 'frigid');
  const HEAT = {
    torrid: { n: T2('Torrid Zone', 'उष्ण कटिबंध'), d: T2('hot: the Sun can be overhead', 'गरम: सूर्य सिर के ऊपर आ सकता है'), col: '#FF7A1A' },
    temperate: { n: T2('Temperate Zone', 'शीतोष्ण कटिबंध'), d: T2('mild: the Sun is never overhead', 'सम: सूर्य कभी सिर के ऊपर नहीं आता'), col: '#22C55E' },
    frigid: { n: T2('Frigid Zone', 'शीत कटिबंध'), d: T2('very cold: the Sun is always low', 'बहुत ठंडा: सूर्य हमेशा नीचा रहता है'), col: '#02CFF9' },
  };
  const LINES = [
    { id: 'equator', lat: 0, n: T2('Equator', 'भूमध्य रेखा'), col: '#FF6B57' },
    { id: 'cancer', lat: 23.5, n: T2('Tropic of Cancer', 'कर्क रेखा'), col: '#FFD23F', dash: 1 },
    { id: 'capricorn', lat: -23.5, n: T2('Tropic of Capricorn', 'मकर रेखा'), col: '#FFD23F', dash: 1 },
    { id: 'arctic', lat: 66.5, n: T2('Arctic Circle', 'आर्कटिक वृत्त'), col: '#02CFF9', dash: 1 },
    { id: 'antarctic', lat: -66.5, n: T2('Antarctic Circle', 'अंटार्कटिक वृत्त'), col: '#02CFF9', dash: 1 },
  ];
  const MERID = [
    { id: 'prime', lon: 0, n: T2('Prime Meridian (Greenwich)', 'प्रधान याम्योत्तर (ग्रीनविच)'), col: '#FFFFFF' },
    { id: 'ist', lon: 82.5, n: T2('IST meridian 82°30′ E', 'भारतीय मानक याम्योत्तर 82°30′ पूर्व'), col: '#FF7A1A', dash: 1 },
    { id: 'idl', lon: 180, n: T2('International Date Line', 'अंतरराष्ट्रीय तिथि रेखा'), col: '#8B3DFF', dash: 1 },
  ];
  function specialAt(lat, lon) {
    const out = [];
    LINES.forEach((l) => { if (l.lat === lat) out.push(l.n); });
    MERID.forEach((l) => { if (l.lon === lon || (l.lon === 180 && lon === -180)) out.push(l.n); });
    return out;
  }

  // ---------------------------------------------------------------- questions (built from the same data, so they are always true)
  const mkQ = (q, opts, a, why) => ({ q, o: opts, a, why });
  const rot = (qq, k) => { const n = qq.o.length, s = k % n; return { q: qq.q, why: qq.why, o: qq.o.map((_, i) => qq.o[(i + s) % n]), a: (qq.a - s + n) % n }; };
  const nm = (id) => P[id].n;
  const withName = (T, id) => T2(T.en.replace('{p}', P[id].n.en), T.hi.replace('{p}', P[id].n.hi));
  function buildQuestions(mode, place) {
    const Q = [];
    const home = homeOf(place);
    if (mode === 'grid') {
      if (place) {
        const p = P[place], lat = Math.round(p.lat), lon = Math.round(p.lon);
        const cands = [[lat, lon], [-lat, lon], [lat, -lon], [-lon, lat], [lat + 20, lon]];
        const seen = new Set(), o = [];
        cands.forEach((c) => { const k = c[0] + '|' + c[1]; if (!seen.has(k) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180 && o.length < 4) { seen.add(k); o.push(c); } });
        Q.push(mkQ(withName(T2('Which pair of numbers is the position of {p}?', '{p} की स्थिति कौन-सी संख्या-जोड़ी है?'), place), o.map((c) => posT(c[0], c[1])), 0, T2(`${p.n.en} is at about ${posT(lat, lon).en}. Latitude first, then longitude.`, `${p.n.hi} लगभग ${posT(lat, lon).hi} पर है। पहले अक्षांश, फिर देशांतर।`)));
      }
      Q.push(mkQ(T2('Which imaginary line is at 0° latitude?', 'कौन-सी काल्पनिक रेखा 0° अक्षांश पर है?'),
        [T2('The Equator', 'भूमध्य रेखा'), T2('The Tropic of Cancer', 'कर्क रेखा'), T2('The Prime Meridian', 'प्रधान याम्योत्तर'), T2('The Arctic Circle', 'आर्कटिक वृत्त')], 0,
        T2('The Equator is 0° latitude. It cuts the Earth into the Northern and the Southern Hemisphere.', 'भूमध्य रेखा 0° अक्षांश है। यह पृथ्वी को उत्तरी और दक्षिणी गोलार्ध में बाँटती है।')));
      Q.push(mkQ(T2('The Tropic of Cancer passes through India. Where is it?', 'कर्क रेखा भारत से होकर जाती है। यह कहाँ है?'),
        [latT(23.5), latT(-23.5), latT(66.5), T2('0°', '0°')], 0,
        T2('The Tropic of Cancer is at 23°30′ N. It crosses eight Indian states, for example Gujarat, Madhya Pradesh and West Bengal.', 'कर्क रेखा 23°30′ उत्तर पर है। यह भारत के आठ राज्यों से गुज़रती है, जैसे गुजरात, मध्य प्रदेश और पश्चिम बंगाल।')));
      Q.push(mkQ(T2('Which lines join the North Pole to the South Pole?', 'कौन-सी रेखाएँ उत्तरी ध्रुव को दक्षिणी ध्रुव से जोड़ती हैं?'),
        [T2('Lines of longitude (meridians)', 'देशांतर रेखाएँ (याम्योत्तर)'), T2('Lines of latitude (parallels)', 'अक्षांश रेखाएँ (समानांतर)'), T2('Only the Equator', 'केवल भूमध्य रेखा'), T2('The two Tropics', 'दोनों कटिबंध रेखाएँ')], 0,
        T2('Meridians are half circles from pole to pole. Parallels of latitude are full circles that run east to west.', 'याम्योत्तर ध्रुव से ध्रुव तक अर्ध-वृत्त हैं। अक्षांश रेखाएँ पूरब से पश्चिम जाने वाले पूरे वृत्त हैं।')));
      Q.push(mkQ(T2('Which line is at 0° longitude?', 'कौन-सी रेखा 0° देशांतर पर है?'),
        [T2('The Prime Meridian', 'प्रधान याम्योत्तर'), T2('The Equator', 'भूमध्य रेखा'), T2('The Tropic of Cancer', 'कर्क रेखा'), T2('The International Date Line', 'अंतरराष्ट्रीय तिथि रेखा')], 0,
        T2('The Prime Meridian passes through Greenwich, near London. Longitude is counted east and west from it.', 'प्रधान याम्योत्तर लंदन के पास ग्रीनविच से गुज़रती है। देशांतर इससे पूरब और पश्चिम गिना जाता है।')));
      Q.push(mkQ(T2('India lies in which hemispheres?', 'भारत किन गोलार्धों में है?'),
        [T2('Northern and Eastern', 'उत्तरी और पूर्वी'), T2('Northern and Western', 'उत्तरी और पश्चिमी'), T2('Southern and Eastern', 'दक्षिणी और पूर्वी'), T2('Southern and Western', 'दक्षिणी और पश्चिमी')], 0,
        T2('India is north of the Equator (8° N to 37° N) and east of the Prime Meridian (68° E to 97° E).', 'भारत भूमध्य रेखा के उत्तर (8° उ. से 37° उ.) और प्रधान याम्योत्तर के पूर्व (68° पू. से 97° पू.) में है।')));
      Q.push(mkQ(T2('The land between the two Tropics is called the…', 'दोनों कटिबंध रेखाओं के बीच के भाग को क्या कहते हैं?'),
        [HEAT.torrid.n, HEAT.temperate.n, HEAT.frigid.n], 0, T2('Between 23°30′ N and 23°30′ S the Sun can be directly overhead, so it is the hottest belt: the Torrid Zone.', '23°30′ उत्तर और 23°30′ दक्षिण के बीच सूर्य सिर के ठीक ऊपर आ सकता है, इसलिए यह सबसे गरम पट्टी, उष्ण कटिबंध, है।')));
      const farther = (a, b) => { const hi = P[a].lat > P[b].lat ? a : b; return mkQ(T2('Which place is farther north?', 'कौन-सा स्थान अधिक उत्तर में है?'), [nm(hi), nm(hi === a ? b : a)], 0, T2(`${P[hi].n.en} is at ${d1(P[hi].lat)} N and ${P[hi === a ? b : a].n.en} at ${d1(P[hi === a ? b : a].lat)} N. A bigger latitude number (in the north) means farther north.`, `${P[hi].n.hi} ${d1(P[hi].lat)} उ. पर और ${P[hi === a ? b : a].n.hi} ${d1(P[hi === a ? b : a].lat)} उ. पर है। उत्तर में बड़ा अक्षांश अधिक उत्तर बताता है।`)); };
      Q.push(farther('delhi', 'chennai'), farther('london', 'mumbai'));
      Q.push(mkQ(T2('Which of these places is in the Southern Hemisphere?', 'इनमें से कौन-सा स्थान दक्षिणी गोलार्ध में है?'), [nm('sydney'), nm('delhi'), nm('london'), nm('cairo')], 0, T2(`Sydney is at ${d1(P.sydney.lat)} S, south of the Equator.`, `सिडनी ${d1(P.sydney.lat)} दक्षिण पर, भूमध्य रेखा के दक्षिण में है।`)));
      Q.push(mkQ(withName(T2('In which heat zone is {p}?', '{p} किस ताप कटिबंध में है?'), 'delhi'), [HEAT.temperate.n, HEAT.torrid.n, HEAT.frigid.n], 0, T2(`Delhi is at ${d1(P.delhi.lat)} N, north of the Tropic of Cancer (23°30′ N) and south of the Arctic Circle: the Temperate Zone.`, `दिल्ली ${d1(P.delhi.lat)} उ. पर है, कर्क रेखा (23°30′ उ.) के उत्तर और आर्कटिक वृत्त के दक्षिण में: शीतोष्ण कटिबंध।`)));
      Q.push(mkQ(withName(T2('{p} is almost on the Equator. What is its latitude, nearly?', '{p} लगभग भूमध्य रेखा पर है। इसका अक्षांश लगभग क्या है?'), 'quito'), [T2('0°', '0°'), latT(23.5), latT(45), latT(66.5)], 0, T2('Quito is at less than 1° from the Equator, so its latitude is about 0°. The name "Ecuador" means "Equator".', 'क्विटो भूमध्य रेखा से 1° से भी कम दूर है, इसलिए इसका अक्षांश लगभग 0° है। "इक्वाडोर" का अर्थ ही "भूमध्य रेखा" है।')));
      Q.push(mkQ(T2('What is the latitude of the North Pole?', 'उत्तरी ध्रुव का अक्षांश क्या है?'), [latT(90), T2('0°', '0°'), latT(66.5), T2('180°', '180°')], 0, T2('Latitude is counted from 0° at the Equator to 90° at the poles.', 'अक्षांश भूमध्य रेखा पर 0° से ध्रुवों पर 90° तक गिना जाता है।')));
    }
    if (mode === 'time') {
      Q.push(mkQ(T2('The Earth turns 360° in 24 hours. How many degrees of longitude make 1 hour?', 'पृथ्वी 24 घंटे में 360° घूमती है। 1 घंटे में कितने अंश देशांतर होते हैं?'), [T2('15°', '15°'), T2('10°', '10°'), T2('24°', '24°'), T2('30°', '30°')], 0, T2('360° ÷ 24 hours = 15° in each hour. So 1° takes 4 minutes.', '360° ÷ 24 घंटे = हर घंटे 15°। इसलिए 1° में 4 मिनट लगते हैं।')));
      Q.push(mkQ(T2('Which way does the Earth spin?', 'पृथ्वी किस दिशा में घूमती है?'), [T2('West to east', 'पश्चिम से पूर्व'), T2('East to west', 'पूर्व से पश्चिम'), T2('North to south', 'उत्तर से दक्षिण'), T2('It does not spin', 'यह घूमती नहीं')], 0, T2('The Earth spins from west to east, so the Sun seems to rise in the east. Places in the east see sunrise first.', 'पृथ्वी पश्चिम से पूर्व घूमती है, इसलिए सूर्य पूर्व में उगता दिखता है। पूर्व के स्थानों में सूर्योदय पहले होता है।')));
      const noonAt = (lon, ans, why) => mkQ(T2(`It is 12 noon at Greenwich (0°). What is the Sun time at ${dm(lon)} ${lon < 0 ? 'W' : 'E'}?`, `ग्रीनविच (0°) में दोपहर 12 बजे हैं। ${dm(lon)} ${lon < 0 ? 'पश्चिम' : 'पूर्व'} पर सूर्य-समय क्या होगा?`), ans, 0, why);
      const tOpt = (m) => clockT(m);
      Q.push(noonAt(90, [tOpt(1080), tOpt(360), tOpt(720), tOpt(1260)], T2('90° east is 90 × 4 = 360 minutes = 6 hours ahead. 12 noon + 6 hours = 6:00 pm.', '90° पूर्व पर 90 × 4 = 360 मिनट = 6 घंटे आगे। दोपहर 12 + 6 घंटे = शाम 6:00 बजे।')));
      Q.push(noonAt(-60, [tOpt(480), tOpt(960), tOpt(720), tOpt(300)], T2('60° west is 60 × 4 = 240 minutes = 4 hours behind. 12 noon − 4 hours = 8:00 am.', '60° पश्चिम पर 60 × 4 = 240 मिनट = 4 घंटे पीछे। दोपहर 12 − 4 घंटे = सुबह 8:00 बजे।')));
      Q.push(mkQ(T2('Kolkata (88° E) and Mumbai (73° E). Where does the Sun rise first?', 'कोलकाता (88° पू.) और मुंबई (73° पू.)। सूर्य पहले कहाँ उगता है?'), [nm('kolkata'), nm('mumbai'), T2('Both together', 'दोनों में साथ-साथ')], 0, T2('Kolkata is 15° farther east, so its Sun time is 1 hour ahead. Sunrise reaches the east first.', 'कोलकाता 15° अधिक पूर्व में है, इसलिए वहाँ सूर्य-समय 1 घंटा आगे है। सूर्योदय पूर्व में पहले पहुँचता है।')));
      Q.push(mkQ(T2('It is 12 noon at your place. What is the Sun time at a place 30° east of you?', 'आपके स्थान पर दोपहर 12 बजे हैं। आपसे 30° पूर्व के स्थान पर सूर्य-समय क्या है?'), [tOpt(840), tOpt(600), tOpt(720), tOpt(960)], 0, T2('30° = 2 hours. East is ahead, so 12 noon + 2 hours = 2:00 pm.', '30° = 2 घंटे। पूर्व आगे होता है, इसलिए दोपहर 12 + 2 घंटे = दोपहर 2:00 बजे।')));
      Q.push(mkQ(T2('Compared with Greenwich, the Sun time of a place east of it is…', 'ग्रीनविच की तुलना में उसके पूर्व के स्थान का सूर्य-समय…'), [T2('ahead (later)', 'आगे (बाद का)'), T2('behind (earlier)', 'पीछे (पहले का)'), T2('exactly the same', 'ठीक वही')], 0, T2('The Sun reaches the east first, so clocks there show a later time.', 'सूर्य पूर्व में पहले पहुँचता है, इसलिए वहाँ की घड़ी में समय आगे होता है।')));
      Q.push(mkQ(T2('What causes day and night?', 'दिन और रात किससे होते हैं?'), [T2('The Earth rotating on its axis', 'पृथ्वी का अपनी धुरी पर घूमना'), T2('The Earth going round the Sun', 'पृथ्वी का सूर्य के चारों ओर घूमना'), T2('The Moon blocking the Sun', 'चंद्रमा का सूर्य को ढकना')], 0, T2('Rotation takes about 24 hours. The half facing the Sun has day; the other half has night. Going round the Sun (revolution) takes a year and gives the seasons.', 'घूर्णन में लगभग 24 घंटे लगते हैं। सूर्य की ओर का आधा भाग दिन में और दूसरा रात में होता है। सूर्य का चक्कर (परिक्रमण) एक वर्ष में होता है और ऋतुएँ बनाता है।')));
    }
    if (mode === 'zones') {
      Q.push(mkQ(T2('The world is divided into how many standard time zones of 15° each?', '15°-15° के कितने मानक समय क्षेत्रों में विश्व बँटा है?'), [T2('24', '24'), T2('12', '12'), T2('15', '15'), T2('36', '36')], 0, T2('360° ÷ 15° = 24 zones, one for each hour of the day.', '360° ÷ 15° = 24 क्षेत्र, दिन के हर घंटे के लिए एक।')));
      Q.push(mkQ(T2('Which meridian gives the Indian Standard Time (IST)?', 'भारतीय मानक समय (IST) किस याम्योत्तर से तय होता है?'), [lonT(82.5), lonT(77), lonT(68), lonT(97)], 0, T2('IST uses 82°30′ E, which passes near Mirzapur in Uttar Pradesh. Delhi is at 77° E, not on it.', 'IST उत्तर प्रदेश के मिर्ज़ापुर के पास से जाने वाली 82°30′ पूर्व रेखा से तय होता है। दिल्ली 77° पूर्व पर है, उस पर नहीं।')));
      Q.push(mkQ(T2('IST is ahead of Greenwich Mean Time (GMT) by…', 'IST ग्रीनविच माध्य समय (GMT) से कितना आगे है?'), [durT(330), durT(300), durT(360), durT(270)], 0, T2('82.5° ÷ 15° = 5.5 hours, that is 5 hours 30 minutes.', '82.5° ÷ 15° = 5.5 घंटे, यानी 5 घंटे 30 मिनट।')));
      const noonG = (id) => { const p = P[id]; const m = 720 + p.off; return mkQ(withName(T2('It is 12 noon in London (GMT). What time is it in {p}?', 'लंदन (GMT) में दोपहर 12 बजे हैं। {p} में कितने बजे हैं?'), id), [clockT(m), clockT(m + 120), clockT(m - 180), clockT(m + 360)], 0, T2(`${P[id].n.en} is ${offT(p.off)}. 12:00 ${p.off >= 0 ? '+' : '−'} ${durT(p.off).en} = ${clockT(m).en}.`, `${P[id].n.hi} ${offT(p.off)} है। 12:00 ${p.off >= 0 ? '+' : '−'} ${durT(p.off).hi} = ${clockT(m).hi}।`)); };
      Q.push(noonG('delhi'), noonG('tokyo'), noonG('new_york'));
      Q.push(mkQ(T2('Which place keeps a time ahead of India?', 'कौन-सा स्थान भारत से आगे का समय रखता है?'), [nm('tokyo'), nm('london'), nm('new_york'), nm('cairo')], 0, T2('Tokyo is UTC+9, India is UTC+5:30. Places farther east are ahead of India; the others here are behind.', 'टोक्यो UTC+9 है, भारत UTC+5:30। जो स्थान और पूर्व में हैं वे भारत से आगे हैं; यहाँ बाकी सब पीछे हैं।')));
      Q.push(mkQ(T2('India stretches from 68° E to 97° E. About how much earlier does the Sun rise in the far east than in the far west?', 'भारत 68° पू. से 97° पू. तक फैला है। पूर्वी छोर पर पश्चिमी छोर से लगभग कितना पहले सूर्य उगता है?'), [T2('about 2 hours', 'लगभग 2 घंटे'), T2('about 12 hours', 'लगभग 12 घंटे'), T2('about 30 minutes', 'लगभग 30 मिनट'), T2('no difference', 'कोई अंतर नहीं')], 0, T2('29° × 4 minutes = 116 minutes, about 2 hours. Even so, all of India keeps one time, IST, so clocks agree across the country.', '29° × 4 मिनट = 116 मिनट, लगभग 2 घंटे। फिर भी पूरा भारत एक ही समय, IST, रखता है, इसलिए पूरे देश में घड़ियाँ एक-सी रहती हैं।')));
      Q.push(mkQ(T2('Kathmandu keeps UTC+5:45. Compared with Indian time its clocks are…', 'काठमांडू UTC+5:45 रखता है। भारतीय समय की तुलना में वहाँ की घड़ी…'), [T2('15 minutes ahead', '15 मिनट आगे'), T2('15 minutes behind', '15 मिनट पीछे'), T2('1 hour ahead', '1 घंटा आगे'), T2('the same', 'वही')], 0, T2('5:45 − 5:30 = 15 minutes more, so Nepal is 15 minutes ahead of India.', '5:45 − 5:30 = 15 मिनट अधिक, इसलिए नेपाल भारत से 15 मिनट आगे है।')));
      Q.push(mkQ(T2('Which meridian is the International Date Line mostly along?', 'अंतरराष्ट्रीय तिथि रेखा अधिकतर किस याम्योत्तर के साथ-साथ है?'), [T2('180°', '180°'), T2('0°', '0°'), T2('90° E', '90° पू.'), T2('82°30′ E', '82°30′ पू.')], 0, T2('The 180° meridian is opposite the Prime Meridian. The line bends a little so that islands keep one date.', '180° याम्योत्तर प्रधान याम्योत्तर के ठीक सामने है। रेखा थोड़ी मुड़ती है ताकि द्वीपों की एक ही तिथि रहे।')));
      Q.push(mkQ(T2('You cross the International Date Line going east (towards America). The calendar date…', 'आप अंतरराष्ट्रीय तिथि रेखा पूर्व की ओर (अमेरिका की ओर) पार करते हैं। कैलेंडर की तिथि…'), [T2('goes back one day', 'एक दिन पीछे हो जाती है'), T2('goes forward one day', 'एक दिन आगे हो जाती है'), T2('stays the same', 'वही रहती है')], 0, T2('West of the line it is one day later than east of it. Going east you gain a day back, so the date goes back by one.', 'रेखा के पश्चिम में पूर्व से एक दिन आगे की तिथि होती है। पूर्व जाने पर तिथि एक दिन पीछे हो जाती है।')));
    }
    if (mode === 'directions') {
      const hp = P[home];
      DIRCITIES.filter((i) => i !== home).forEach((id) => {
        const b = bearing(hp, P[id]);
        if (sectorMargin(b) < 7 || Q.length >= 4) return;
        const k = sectorOf(b), o = [k, (k + 4) % 8, (k + 2) % 8, (k + 6) % 8].map((i) => DIRS[i].n);
        Q.push(mkQ(T2(`In which direction is ${P[id].n.en} from ${hp.n.en}?`, `${hp.n.hi} से ${P[id].n.hi} किस दिशा में है?`), o, 0, T2(`From ${hp.n.en}, ${P[id].n.en} lies ${DIRS[k].n.en} (the line points about ${Math.round(b)}° clockwise from north), about ${inr(Math.round(distKm(hp, P[id]) / 10) * 10)} km away.`, `${hp.n.hi} से ${P[id].n.hi} ${DIRS[k].n.hi} दिशा में है (रेखा उत्तर से घड़ी की दिशा में लगभग ${Math.round(b)}° पर है), लगभग ${inr(Math.round(distKm(hp, P[id]) / 10) * 10)} किमी दूर।`)));
      });
      Q.push(mkQ(T2('The Sun rises in the…', 'सूर्य किस दिशा में उगता है?'), [DIRS[2].n, DIRS[6].n, DIRS[0].n, DIRS[4].n], 0, T2('The Earth spins from west to east, so in the morning the Sun appears on the eastern side. It sets in the west.', 'पृथ्वी पश्चिम से पूर्व घूमती है, इसलिए सुबह सूर्य पूर्व की ओर दिखता है। वह पश्चिम में अस्त होता है।')));
      Q.push(mkQ(T2('You face north. Which direction is on your right hand?', 'आपका मुँह उत्तर की ओर है। आपके दाएँ हाथ की ओर कौन-सी दिशा है?'), [DIRS[2].n, DIRS[6].n, DIRS[4].n, DIRS[1].n], 0, T2('Facing north, east is on your right and west is on your left. South is behind you.', 'उत्तर की ओर मुँह करने पर पूर्व दाएँ और पश्चिम बाएँ होता है। दक्षिण पीछे रहता है।')));
      Q.push(mkQ(T2('Which direction is exactly opposite to north-east?', 'उत्तर-पूर्व के ठीक विपरीत कौन-सी दिशा है?'), [DIRS[5].n, DIRS[3].n, DIRS[7].n, DIRS[4].n], 0, T2('Opposite directions are 180° apart: north-east and south-west.', 'विपरीत दिशाएँ 180° दूर होती हैं: उत्तर-पूर्व और दक्षिण-पश्चिम।')));
      Q.push(mkQ(T2('You face the setting Sun. Which direction is on your right hand?', 'आप डूबते सूर्य की ओर मुँह करके खड़े हैं। दाएँ हाथ की ओर कौन-सी दिशा है?'), [DIRS[0].n, DIRS[4].n, DIRS[2].n, DIRS[6].n], 0, T2('The Sun sets in the west, so you face west. Facing west, north is on your right and south on your left.', 'सूर्य पश्चिम में डूबता है, इसलिए आप पश्चिम की ओर देखते हैं। पश्चिम की ओर मुँह करने पर उत्तर दाएँ और दक्षिण बाएँ होता है।')));
    }
    if (mode === 'scale') {
      const hp = P[home];
      chipsFor('scale', place).slice(0, 8).filter((id) => distKm(hp, P[id]) > 300).slice(0, 2).forEach((id) => {
        const d = Math.round(distKm(hp, P[id]) / 50) * 50, o = [d, Math.round(d / 2 / 50) * 50, d * 2, Math.round(d * 1.5 / 50) * 50];
        Q.push(mkQ(T2(`About how far is ${P[id].n.en} from ${hp.n.en}, in a straight line over the Earth?`, `${hp.n.hi} से ${P[id].n.hi} सीधी (पृथ्वी की सतह पर) रेखा में लगभग कितनी दूर है?`), o.map((v) => T2(`${inr(v)} km`, `${inr(v)} किमी`)), 0, T2(`The shortest path over the Earth is a great-circle arc. For ${P[id].n.en} it is about ${inr(d)} km.`, `पृथ्वी पर सबसे छोटा रास्ता बड़े वृत्त की चाप है। ${P[id].n.hi} के लिए यह लगभग ${inr(d)} किमी है।`)));
      });
      Q.push(mkQ(T2('A map has the scale 1 cm = 100 km. Two cities are 500 km apart. How long is the line between them on the map?', 'मानचित्र का पैमाना 1 सेमी = 100 किमी है। दो नगर 500 किमी दूर हैं। मानचित्र पर उनके बीच की रेखा कितनी लंबी होगी?'), [T2('5 cm', '5 सेमी'), T2('50 cm', '50 सेमी'), T2('0.5 cm', '0.5 सेमी'), T2('500 cm', '500 सेमी')], 0, T2('Map length = real distance ÷ km per cm = 500 ÷ 100 = 5 cm.', 'मानचित्र पर लंबाई = वास्तविक दूरी ÷ किमी प्रति सेमी = 500 ÷ 100 = 5 सेमी।')));
      Q.push(mkQ(T2('On a map with the scale 1 cm = 50 km, a road is drawn 3 cm long. How long is the real road?', '1 सेमी = 50 किमी वाले मानचित्र पर एक सड़क 3 सेमी लंबी खिंची है। असली सड़क कितनी लंबी है?'), [T2('150 km', '150 किमी'), T2('53 km', '53 किमी'), T2('16 km', '16 किमी'), T2('1,500 km', '1,500 किमी')], 0, T2('Real distance = map length × km per cm = 3 × 50 = 150 km.', 'वास्तविक दूरी = मानचित्र की लंबाई × किमी प्रति सेमी = 3 × 50 = 150 किमी।')));
      Q.push(mkQ(T2('Which map shows more detail of a small area?', 'छोटे क्षेत्र का अधिक ब्योरा कौन-सा मानचित्र दिखाता है?'), [T2('1 cm = 1 km (large scale)', '1 सेमी = 1 किमी (बड़ा पैमाना)'), T2('1 cm = 1,000 km (small scale)', '1 सेमी = 1,000 किमी (छोटा पैमाना)')], 0, T2('A large-scale map shows a small area in detail, like a town plan. A small-scale map shows a big area with less detail, like a world map.', 'बड़े पैमाने का मानचित्र छोटे क्षेत्र को ब्योरे से दिखाता है, जैसे नगर का नक्शा। छोटे पैमाने का मानचित्र बड़ा क्षेत्र कम ब्योरे से दिखाता है, जैसे विश्व का मानचित्र।')));
      Q.push(mkQ(T2('About how many kilometres is 1° of latitude?', '1° अक्षांश लगभग कितने किलोमीटर का होता है?'), [T2('111 km', '111 किमी'), T2('11 km', '11 किमी'), T2('360 km', '360 किमी'), T2('1,000 km', '1,000 किमी')], 0, T2('The Earth is about 40,000 km round. 40,000 ÷ 360 is about 111 km for each degree.', 'पृथ्वी की परिधि लगभग 40,000 किमी है। 40,000 ÷ 360 लगभग 111 किमी प्रति अंश है।')));
    }
    return Q.map((q, i) => rot(q, i));
  }

  // ---------------------------------------------------------------- drawing helpers
  function dens(pts, step) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], k = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
      for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    return out;
  }
  const rect = (a, b, c, d) => dens([[a, c], [b, c], [b, d], [a, d]], 3);
  let DATA = null;
  function data() {
    if (DATA) return DATA;
    const land = LAND.filter((x) => !x.ice).map((x) => dens(x.c, 2.5)), ice = LAND.filter((x) => x.ice).map((x) => dens(x.c, 2.5));
    const lat = (l) => { const o = []; for (let x = -180; x <= 180; x += 3) o.push([x, l]); return o; };
    const lon = (l) => { const o = []; for (let y = -90; y <= 90; y += 3) o.push([l, y]); return o; };
    DATA = { land, ice, india: INDIA_SHAPES.map((c) => dens(c, 2)), seas: SEAS.map((c) => dens(c, 2)), lat, lon };
    return DATA;
  }
  const limbPt = (g, a) => [g.cx + g.R * Math.cos(a), g.cy - g.R * Math.sin(a)];
  function pathPoly(g, pts) {
    const n = pts.length;
    if (n < 3) return '';
    const q = pts.map((p) => g.proj(p[0], p[1]));
    if (g.flat) return 'M' + q.map((a) => n1(a.x) + ' ' + n1(a.y)).join('L') + 'Z';
    const start = q.findIndex((a) => a.v);
    if (start < 0) return '';
    let area = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const o = area >= 0 ? 1 : -1, TAU = 2 * Math.PI, out = [], ang = (a) => Math.atan2(a.uy, a.ux);
    let k = 0;
    while (k < n) {
      const a = q[(start + k) % n];
      if (a.v) { out.push([a.x, a.y]); k++; continue; }
      let j = k;
      while (j < n && !q[(start + j) % n].v) j++;
      const aE = ang(a), aN = ang(q[(start + j - 1) % n]);
      let d = aN - aE;
      if (j - k < 4) { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; }
      else d = o > 0 ? ((d % TAU) + TAU) % TAU : -((((-d) % TAU) + TAU) % TAU);
      const st = Math.max(1, Math.ceil(Math.abs(d) / 0.1));
      for (let m = 0; m <= st; m++) out.push(limbPt(g, aE + (d * m) / st));
      k = j;
    }
    return 'M' + out.map((p) => n1(p[0]) + ' ' + n1(p[1])).join('L') + 'Z';
  }
  function pathLine(g, pts) {
    let d = '', pen = false;
    pts.forEach((p) => {
      const q = g.proj(p[0], p[1]);
      if (q.v) { d += (pen ? 'L' : 'M') + n1(q.x) + ' ' + n1(q.y); pen = true; } else pen = false;
    });
    return d;
  }
  // Split a polyline where it jumps across the +-180 edge of a flat map.
  function pathFlatLine(g, pts) {
    let d = '', prev = null;
    pts.forEach((p) => {
      const q = g.proj(p[0], p[1]);
      d += (prev === null || Math.abs(p[0] - prev) > 180 ? 'M' : 'L') + n1(q.x) + ' ' + n1(q.y);
      prev = p[0];
    });
    return d;
  }
  function clockSVG(min, label) {
    const m = ((Math.floor(min) % 1440) + 1440) % 1440, h = m / 60, day = h >= 6 && h < 18;
    const bg = day ? '#FFF3C4' : '#1B2A66', fg = day ? '#1E293B' : '#FFFFFF', ring = day ? '#F5B90A' : '#8B3DFF';
    const ha = ((h % 12) / 12) * 360, ma = (m % 60) * 6;
    let tk = '';
    for (let i = 0; i < 12; i++) tk += `<line x1="32" y1="6" x2="32" y2="${i % 3 ? 9 : 12}" stroke="${fg}" stroke-width="${i % 3 ? 1 : 2}" transform="rotate(${i * 30} 32 32)"/>`;
    return `<svg class="gl-aclk" viewBox="0 0 64 64" role="img" aria-label="${esc(label)}"><circle cx="32" cy="32" r="29" fill="${bg}" stroke="${ring}" stroke-width="3"/>${tk}`
      + `<line x1="32" y1="32" x2="32" y2="17" stroke="${fg}" stroke-width="3.2" stroke-linecap="round" transform="rotate(${ha} 32 32)"/>`
      + `<line x1="32" y1="32" x2="32" y2="9" stroke="${fg}" stroke-width="2" stroke-linecap="round" transform="rotate(${ma} 32 32)"/><circle cx="32" cy="32" r="2.6" fill="#FF6B57"/></svg>`;
  }
  const star = (x, y, r) => { let d = ''; for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = (i * 36 - 90) * RAD; d += (i ? 'L' : 'M') + n1(x + rr * Math.cos(a)) + ' ' + n1(y + rr * Math.sin(a)); } return d + 'Z'; };

  const CSS = `
.gl-root{--gl-r:18px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px;font-family:var(--font-body,system-ui);color:var(--ink,#1E293B);width:100%}
.gl-root.gl-wide{grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);align-items:start}
.gl-root *{box-sizing:border-box}
.gl-left{display:grid;gap:10px;min-width:0}
.gl-wide .gl-left{position:sticky;top:8px}
.gl-stage{position:relative;border-radius:var(--gl-r);overflow:hidden;background:radial-gradient(120% 90% at 30% 20%,#13317c 0%,#081a4d 48%,#040c26 100%);box-shadow:0 10px 28px rgba(6,18,51,.28);outline-offset:3px}
.gl-stars{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(1.4px 1.4px at 12% 18%,#fff 60%,transparent 62%),radial-gradient(1.2px 1.2px at 82% 12%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 70% 80%,#cfe 60%,transparent 62%),radial-gradient(1.4px 1.4px at 22% 84%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 92% 52%,#fff 60%,transparent 62%),radial-gradient(1px 1px at 6% 55%,#fff 60%,transparent 62%),radial-gradient(1.2px 1.2px at 48% 6%,#fff 60%,transparent 62%)}
.gl-stage.gl-flat .gl-stars{opacity:0}
.gl-stage.gl-flat{background:linear-gradient(160deg,#0e2a6e,#0a1d52)}
.gl-svg{position:relative;display:block;width:100%;height:auto;max-height:78vh;touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none}
.gl-svg.gl-grab{cursor:grabbing}
.gl-lbl{font-family:var(--font-body,system-ui);font-weight:700;fill:#fff;paint-order:stroke;stroke:#061233;stroke-width:3.2px;stroke-linejoin:round;pointer-events:none}
.gl-lbl.d{fill:#1E293B;stroke:#fff}
.gl-pulse{transform-box:fill-box;transform-origin:center;animation:gl-pulse 1.8s ease-out infinite}
@keyframes gl-pulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(2.2);opacity:0}}
@media (prefers-reduced-motion:reduce){.gl-pulse{animation:none;opacity:.5}}
.gl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gl-seg{display:inline-flex;border:1px solid var(--line,#CBD5E1);border-radius:14px;overflow:hidden;background:var(--surface,#fff)}
.gl-seg button{border:0;background:transparent;min-height:44px;min-width:44px;padding:0 14px;font:700 15px var(--font-body,system-ui);color:var(--ink,#1E293B);cursor:pointer}
.gl-seg button[aria-pressed=true]{background:var(--royal,#1D4ED8);color:#fff}
.gl-btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:14px;border:1px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font:700 15px var(--font-body,system-ui);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.gl-btn:hover{border-color:var(--royal,#1D4ED8)}
.gl-btn[aria-pressed=true]{background:var(--royal,#1D4ED8);color:#fff;border-color:var(--royal,#1D4ED8)}
.gl-btn:focus-visible,.gl-seg button:focus-visible,.gl-opt:focus-visible,.gl-chip:focus-visible,.gl-range:focus-visible{outline:3px solid var(--cyan,#02CFF9);outline-offset:2px}
.gl-side{display:grid;gap:12px;min-width:0}
.gl-card{background:var(--surface,#fff);border:1px solid var(--line,#E2E8F0);border-radius:var(--gl-r);padding:12px 14px;box-shadow:0 2px 8px rgba(6,18,51,.06);min-width:0}
.gl-banner{display:flex;gap:10px;align-items:flex-start;background:linear-gradient(135deg,var(--royal-t,#E0E9FF),var(--grape-t,#EFE4FF));font-weight:600;font-size:16px;line-height:1.4}
.gl-banner .ic{flex:none;width:30px;height:30px;border-radius:50%;background:var(--royal,#1D4ED8);color:#fff;display:grid;place-items:center;font-size:16px}
.gl-banner.ok{background:var(--good-t,#DCFCE7)}
.gl-banner.ok .ic{background:var(--good,#15803D)}
.gl-h{font:700 13px var(--font-body,system-ui);letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2,#475569);margin-bottom:8px}
.gl-big{font:800 24px/1.15 var(--font-display,system-ui);color:var(--ink,#1E293B)}
.gl-sub{color:var(--ink-2,#475569);font-size:15px;margin-top:4px;line-height:1.4}
.gl-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.gl-tag{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 11px;font:700 13.5px var(--font-body,system-ui);background:var(--sunk,#F1F5F9);color:var(--ink,#1E293B)}
.gl-dot{width:11px;height:11px;border-radius:50%;display:inline-block}
.gl-sl-row{display:block;margin:2px 0 8px}
.gl-sl-lb{display:flex;justify-content:space-between;gap:8px;font-weight:700;font-size:15px}
.gl-sl-v{font-family:var(--font-display,system-ui);font-size:17px;color:var(--royal,#1D4ED8)}
.gl-range{width:100%;height:44px;margin:0;accent-color:var(--royal,#1D4ED8);cursor:pointer;background:transparent}
.gl-turn{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.gl-turn .gl-h{flex:1 0 100%;margin:0}
.gl-turn small,.gl-spin small{color:var(--ink-2,#475569);font-size:13.5px}
.gl-chips{display:flex;flex-wrap:wrap;gap:8px}
.gl-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1.5px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font:700 15px var(--font-body,system-ui);cursor:pointer}
.gl-chip:hover{border-color:var(--royal,#1D4ED8)}
.gl-chip[aria-pressed=true]{background:var(--royal,#1D4ED8);border-color:var(--royal,#1D4ED8);color:#fff}
.gl-chip.tg{border-style:dashed}
.gl-clocks{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gl-clk{display:flex;gap:10px;align-items:center;background:var(--sunk,#F1F5F9);border-radius:14px;padding:8px 10px;min-width:0}
.gl-aclk{width:58px;height:58px;flex:none}
.gl-clk b{display:block;font:800 19px/1.1 var(--font-display,system-ui)}
.gl-clk span{display:block;font-size:13.5px;color:var(--ink-2,#475569);line-height:1.25}
.gl-spin-row{display:flex;gap:8px;align-items:center}
.gl-spin-row .gl-range{flex:1;min-width:0}
.gl-cmp{width:100%;max-width:300px;margin:0 auto;display:block}
.gl-cmp text{font-family:var(--font-display,system-ui);font-weight:800}
.gl-q{font:700 17px/1.4 var(--font-body,system-ui);margin-bottom:10px}
.gl-opts{display:grid;gap:8px}
.gl-opt{min-height:48px;text-align:left;padding:8px 14px;border-radius:14px;border:1.5px solid var(--line,#CBD5E1);background:var(--surface,#fff);color:var(--ink,#1E293B);font:600 16px var(--font-body,system-ui);cursor:pointer}
.gl-opt:hover:not(:disabled){border-color:var(--royal,#1D4ED8);background:var(--royal-t,#E0E9FF)}
.gl-opt.good{background:var(--good-t,#DCFCE7);border-color:var(--good,#15803D);color:var(--ink,#1E293B)}
.gl-opt.bad{background:var(--bad-t,#FEE2E2);border-color:var(--bad,#B91C1C);color:var(--ink,#1E293B);opacity:.8}
.gl-opt:disabled{cursor:default}
.gl-fb{margin-top:10px;font-size:15.5px;line-height:1.45;min-height:1.2em}
.gl-fb .gl-next{margin-top:10px}
.gl-qn{float:right;font-weight:700;font-size:13px;color:var(--ink-2,#475569)}
.gl-rul{display:block;width:100%;height:auto;margin-top:6px}
.gl-note{font-size:14px;color:var(--ink-2,#475569);margin-top:6px;line-height:1.4}
@media (max-width:420px){.gl-clocks{grid-template-columns:1fr}.gl-big{font-size:21px}}
`;

  // ---------------------------------------------------------------- the lab
  let UID = 0;
  function mount(root, cfg, api) {
    const mode = cfg.mode;
    const uid = 'gl' + ++UID;
    const T = (x) => api.t(x);
    const lang = () => api.lang();
    const homeId = homeOf(cfg.place);
    const home = P[homeId];
    const targetId = mode === 'grid' && cfg.place ? cfg.place : null;
    const chips = chipsFor(mode, cfg.place);
    const questions = buildQuestions(mode, cfg.place);
    const flatOnly = mode === 'zones' || mode === 'directions';
    const turnKey = mode === 'grid' || mode === 'scale' ? 'rotate' : 'view:turn';
    const reduced = L.reducedMotion();
    const r5 = (v) => Math.round(v * 2) / 2;
    const S = { view: flatOnly ? 'flat' : 'globe', lon0: 20, lat0: 15, mk: { lat: 0, lon: 0 }, sel: null, utc: 720, heat: true, km: 500, face: 0, playing: false, qi: 0, answered: false, tried: {}, near: null, found: false, lastTime: null };
    const rafs = [];
    let viewStop = null, built = null, playRaf = 0, drag = null, ro = null, destroyed = false;
    const q = (s) => root.querySelector(s);

    if (mode === 'grid') { S.mk = targetId && Math.abs(P[targetId].lat) < 12 && Math.abs(P[targetId].lon) < 12 ? { lat: 20, lon: -30 } : { lat: 0, lon: 0 }; }
    if (mode === 'time') { S.sel = homeId === 'delhi' && !cfg.place ? 'delhi' : homeId; S.mk = { lat: r5(home.lat), lon: r5(home.lon) }; S.lon0 = S.mk.lon; }
    if (mode === 'zones') { S.sel = cfg.place ? homeId : 'london'; S.mk = { lat: r5(P[S.sel].lat), lon: r5(P[S.sel].lon) }; S.utc = 720; S.lon0 = 0; }
    if (mode === 'directions') { S.mk = { lat: home.lat, lon: home.lon }; }
    if (mode === 'scale') { S.mk = { lat: 0, lon: 80 }; S.lon0 = 70; S.lat0 = 15; }

    // ---- geometry of the current view
    function geom() {
      if (S.view === 'globe') {
        const cx = 200, cy = 200, R = 172, sl = Math.sin(S.lat0 * RAD), cl = Math.cos(S.lat0 * RAD);
        return { flat: false, cx, cy, R, proj(lon, lat) { const p = lat * RAD, dl = (lon - S.lon0) * RAD, cp = Math.cos(p); const ux = cp * Math.sin(dl), uy = cl * Math.sin(p) - sl * cp * Math.cos(dl), c = sl * Math.sin(p) + cl * cp * Math.cos(dl); return { x: cx + R * ux, y: cy - R * uy, ux, uy, c, v: c > 0 }; } };
      }
      if (mode === 'directions') return { flat: true, region: true, W: 400, H: 400, proj: (lon, lat) => ({ x: 15 + (lon - 66) * 11.2, y: 15 + (38 - lat) * 10.9, v: true, c: 1 }) };
      return { flat: true, W: 760, H: 410, proj: (lon, lat) => ({ x: 34 + (lon + 180) * 2, y: 26 + (90 - lat) * 2, v: true, c: 1 }) };
    }
    function invert(g, vx, vy) {
      if (!g.flat) {
        const x = (vx - g.cx) / g.R, y = (g.cy - vy) / g.R, rho = Math.hypot(x, y);
        if (rho > 1) return null;
        const c = Math.asin(rho), sl = Math.sin(S.lat0 * RAD), cl = Math.cos(S.lat0 * RAD);
        const lat = rho === 0 ? S.lat0 : Math.asin(Math.cos(c) * sl + (y * Math.sin(c) * cl) / rho) / RAD;
        const lon = S.lon0 + Math.atan2(x * Math.sin(c), rho * cl * Math.cos(c) - y * sl * Math.sin(c)) / RAD;
        return { lat, lon: norm180(lon) };
      }
      if (g.region) return null;
      const lon = (vx - 34) / 2 - 180, lat = 90 - (vy - 26) / 2;
      return lon < -180 || lon > 180 || lat < -90 || lat > 90 ? null : { lat, lon };
    }

    // ---- markup (built once per language)
    function build() {
      built = lang();
      const sliders = mode === 'grid' || mode === 'time' || mode === 'scale';
      const chipHtml = chips.map((id) => `<button type="button" class="gl-chip${id === targetId ? ' tg' : ''}" data-key="place:${id}" data-pl="${id}" aria-pressed="false">${esc(T(P[id].n))}</button>`).join('');
      const slider = (k, lb, min, max) => `<label class="gl-sl-row"><span class="gl-sl-lb"><span>${esc(T(lb))}</span><span class="gl-sl-v" data-v="${k}"></span></span><input class="gl-range" type="range" min="${min}" max="${max}" step="0.5" data-key="slider:${k}" data-sl="${k}" aria-label="${esc(T(lb))}"></label>`;
      const LAT = T2('Latitude (north–south)', 'अक्षांश (उत्तर–दक्षिण)'), LON = T2('Longitude (east–west)', 'देशांतर (पूर्व–पश्चिम)');
      let cards = `<div class="gl-card gl-banner" role="status" aria-live="polite"><span class="ic" aria-hidden="true">★</span><span class="gl-bt"></span></div>`;
      if (mode === 'grid') cards += `<div class="gl-card gl-read" aria-live="polite"></div>`;
      if (mode === 'time') cards += `<div class="gl-card"><div class="gl-clocks gl-clks"></div><div class="gl-note gl-tn" aria-live="polite"></div></div>`;
      if (mode === 'zones') cards += `<div class="gl-card"><div class="gl-clocks gl-clks"></div><div class="gl-note gl-tn" aria-live="polite"></div></div>`;
      if (mode === 'scale') cards += `<div class="gl-card gl-read" aria-live="polite"></div>`;
      if (mode === 'directions') {
        cards += `<div class="gl-card" data-key="rotate"><div class="gl-h">${esc(T(T2('Turn yourself', 'खुद घूमो')))}</div><div class="gl-cmp-box"></div><div class="gl-turn" style="margin-top:8px"><button type="button" class="gl-btn" data-step="-45" aria-label="${esc(T(T2('Turn left 45 degrees', 'बाएँ 45 अंश घूमो')))}">↺ ${esc(T(T2('Turn left', 'बाएँ')))}</button><button type="button" class="gl-btn" data-step="45" aria-label="${esc(T(T2('Turn right 45 degrees', 'दाएँ 45 अंश घूमो')))}">↻ ${esc(T(T2('Turn right', 'दाएँ')))}</button></div><div class="gl-note gl-face" aria-live="polite"></div></div>`;
        cards += `<div class="gl-card gl-read" aria-live="polite"></div>`;
      }
      if (mode === 'time' || mode === 'zones') {
        cards += `<div class="gl-card gl-spin" data-key="rotate"><div class="gl-h">${esc(T(mode === 'time' ? T2('Turn the Earth: time at Greenwich', 'पृथ्वी घुमाओ: ग्रीनविच का समय') : T2('Turn the clock: time at Greenwich', 'घड़ी घुमाओ: ग्रीनविच का समय')))}</div>`
          + `<div class="gl-spin-row"><button type="button" class="gl-btn" data-spin="-60" aria-label="${esc(T(T2('One hour back', 'एक घंटा पीछे')))}">−1 h</button>`
          + `<input class="gl-range" type="range" min="0" max="1425" step="15" data-spinr aria-label="${esc(T(T2('Time at Greenwich', 'ग्रीनविच का समय')))}">`
          + `<button type="button" class="gl-btn" data-spin="60" aria-label="${esc(T(T2('One hour forward', 'एक घंटा आगे')))}">+1 h</button>`
          + (reduced ? '' : `<button type="button" class="gl-btn" data-play aria-pressed="false" aria-label="${esc(T(T2('Let time run', 'समय चलने दो')))}">▶</button>`) + `</div><div class="gl-note gl-sv"></div></div>`;
      }
      if (sliders) {
        cards += `<div class="gl-card">${slider('lat', LAT, -90, 90)}${slider('long', LON, -180, 180)}`
          + (mode === 'grid' || mode === 'scale' ? `<div class="gl-turn" data-key="rotate"><div class="gl-h" style="margin-top:4px">${esc(T(T2('Turn the globe', 'ग्लोब घुमाओ')))}</div>`
            + [['L', '◀', T2('Turn west', 'पश्चिम की ओर घुमाओ')], ['U', '▲', T2('Tilt north', 'उत्तर की ओर झुकाओ')], ['D', '▼', T2('Tilt south', 'दक्षिण की ओर झुकाओ')], ['R', '▶', T2('Turn east', 'पूर्व की ओर घुमाओ')]].map((b) => `<button type="button" class="gl-btn" data-turn="${b[0]}" aria-label="${esc(T(b[2]))}">${b[1]}</button>`).join('')
            + `<small>${esc(T(T2('or drag the globe', 'या ग्लोब को खींचो')))}</small></div>` : '')
          + (mode === 'time' ? `<div class="gl-turn"><div class="gl-h" style="margin-top:4px">${esc(T(T2('Turn the view', 'दृश्य घुमाओ')))}</div>`
            + [['L', '◀', T2('Turn view west', 'दृश्य पश्चिम की ओर घुमाओ')], ['U', '▲', T2('Tilt view north', 'दृश्य उत्तर की ओर झुकाओ')], ['D', '▼', T2('Tilt view south', 'दृश्य दक्षिण की ओर झुकाओ')], ['R', '▶', T2('Turn view east', 'दृश्य पूर्व की ओर घुमाओ')]].map((b) => `<button type="button" class="gl-btn" data-key="view:turn" data-turn="${b[0]}" aria-label="${esc(T(b[2]))}">${b[1]}</button>`).join('') + `</div>` : '')
          + `</div>`;
      }
      if (mode === 'zones') cards += `<div class="gl-card">${slider('long', LON, -180, 180)}</div>`;
      if (mode === 'scale') {
        cards += `<div class="gl-card"><div class="gl-h">${esc(T(T2('Map scale: 1 cm on the map = ?', 'मानचित्र का पैमाना: मानचित्र पर 1 सेमी = ?')))}</div><div class="gl-chips">${SCALES.map((k) => `<button type="button" class="gl-chip" data-key="scale:${k}" data-scale="${k}" aria-pressed="false">${k >= 1000 ? inr(k) : k} ${esc(T(T2('km', 'किमी')))}</button>`).join('')}</div><div class="gl-ruler"></div></div>`;
      }
      cards += `<div class="gl-card"><div class="gl-h">${esc(T(mode === 'directions' ? T2('Places to look at', 'देखने के स्थान') : T2('Places', 'स्थान')))}</div><div class="gl-chips">${chipHtml}</div></div>`;
      if (questions.length) cards += `<div class="gl-card gl-quiz" data-key="answer"><div class="gl-h">${esc(T(T2('Quick question', 'एक छोटा प्रश्न')))}<span class="gl-qn"></span></div><div class="gl-qbody"></div></div>`;
      const bar = (!flatOnly ? `<div class="gl-seg" role="group" aria-label="${esc(T(T2('Map view', 'मानचित्र का रूप')))}"><button type="button" data-key="view:globe" data-view="globe" aria-pressed="false">🌐 ${esc(T(T2('Globe', 'ग्लोब')))}</button><button type="button" data-key="view:flat" data-view="flat" aria-pressed="false">🗺 ${esc(T(T2('Flat map', 'समतल मानचित्र')))}</button></div>` : '')
        + (mode === 'grid' ? `<button type="button" class="gl-btn" data-key="heat:toggle" data-heat aria-pressed="true">🌡 ${esc(T(T2('Heat zones', 'ताप कटिबंध')))}</button>` : '');
      root.innerHTML = `<div class="gl-root"><div class="gl-left"><div class="gl-stage" tabindex="0" role="group" aria-label="${esc(T(T2('The Earth. Arrow keys turn the view.', 'पृथ्वी। तीर वाली कुंजियाँ दृश्य घुमाती हैं।')))}"><div class="gl-stars"></div>`
        + `<svg class="gl-svg" viewBox="0 0 400 400" role="img" xmlns="http://www.w3.org/2000/svg"><defs>`
        + `<radialGradient id="${uid}-oc" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#58B6FA"/><stop offset=".55" stop-color="#1F78DE"/><stop offset="1" stop-color="#1235A6"/></radialGradient>`
        + `<linearGradient id="${uid}-of" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46A8F5"/><stop offset="1" stop-color="#1B5FCB"/></linearGradient>`
        + `<radialGradient id="${uid}-halo" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="#02CFF9" stop-opacity=".45"/><stop offset="1" stop-color="#02CFF9" stop-opacity="0"/></radialGradient>`
        + `<radialGradient id="${uid}-gl" cx=".3" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
        + `<radialGradient id="${uid}-sh" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#061233" stop-opacity="0"/><stop offset="1" stop-color="#061233" stop-opacity=".5"/></radialGradient>`
        + `<clipPath id="${uid}-cl"><rect class="gl-clr" x="0" y="0" width="10" height="10"/></clipPath>`
        + `</defs><g class="gl-scene"></g></svg></div>${bar ? `<div class="gl-bar">${bar}</div>` : ''}</div><div class="gl-side">${cards}</div></div>`;
      sizeCheck();
      update();
      renderQuiz();
    }
    function sizeCheck() { const el = q('.gl-root'); if (el) el.classList.toggle('gl-wide', (root.clientWidth || 800) >= 720); }

    // ---- scene
    function drawScene() {
      const sc = q('.gl-scene');
      if (!sc) return;
      const g = geom(), D = data();
      const svg = q('.gl-svg'), stage = q('.gl-stage');
      svg.setAttribute('viewBox', g.flat ? `0 0 ${g.W} ${g.H}` : '0 0 400 400');
      stage.classList.toggle('gl-flat', g.flat);
      const fs = g.flat && !g.region ? 17 : 12.5, out = [];
      const sunLon = norm180((720 - S.utc) / 4), night = mode === 'time' || mode === 'zones';
      const cl = q('.gl-clr');
      if (g.flat) { const r = g.region ? [15, 15, 370, 360] : [34, 26, 720, 360]; cl.setAttribute('x', r[0]); cl.setAttribute('y', r[1]); cl.setAttribute('width', r[2]); cl.setAttribute('height', r[3]); cl.setAttribute('rx', 12); }
      if (!g.flat) { out.push(`<circle cx="200" cy="200" r="${g.R + 10}" fill="url(#${uid}-halo)"/><circle cx="200" cy="200" r="${g.R}" fill="url(#${uid}-oc)"/>`); }
      else { const r = g.region ? [15, 15, 370, 360] : [34, 26, 720, 360]; out.push(`<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="12" fill="url(#${uid}-of)"/><g clip-path="url(#${uid}-cl)">`); }
      // land
      out.push(`<path d="${D.land.map((p) => pathPoly(g, p)).join('')}" fill="#79C47A" stroke="#3F8F4C" stroke-width=".8" stroke-linejoin="round"/>`);
      out.push(`<path d="${D.ice.map((p) => pathPoly(g, p)).join('')}" fill="#F1F7FB" stroke="#B7CBD8" stroke-width=".8" stroke-linejoin="round"/>`);
      out.push(`<path d="${D.seas.map((p) => pathPoly(g, p)).join('')}" fill="#3B8FEA" stroke="#2A6FC4" stroke-width=".6"/>`);
      out.push(`<path d="${D.india.map((p) => pathPoly(g, p)).join('')}" fill="#F4B83F" stroke="#B9791B" stroke-width="${g.region ? 1.3 : 0.8}" stroke-linejoin="round"/>`);
      // heat zones
      if (mode === 'grid' && S.heat) {
        const bands = [[-23.5, 23.5, 'torrid'], [23.5, 66.5, 'temperate'], [-66.5, -23.5, 'temperate'], [66.5, 90, 'frigid'], [-90, -66.5, 'frigid']];
        bands.forEach((b) => out.push(`<path d="${pathPoly(g, rect(-180, 180, b[0], b[1]))}" fill="${HEAT[b[2]].col}" fill-opacity="${b[2] === 'torrid' ? 0.62 : b[2] === 'temperate' ? 0.4 : 0.6}" style="mix-blend-mode:overlay"/>`));
      }
      // time zone bands
      if (mode === 'zones') {
        const k0 = Math.round(S.mk.lon / 15);
        for (let k = -12; k <= 12; k++) {
          const a = Math.max(-180, k * 15 - 7.5), b = Math.min(180, k * 15 + 7.5), on = k === k0 || (Math.abs(k0) === 12 && Math.abs(k) === 12 && Math.sign(k) === Math.sign(S.mk.lon || 1));
          out.push(`<path d="${pathPoly(g, rect(a, b, -90, 90))}" fill="${on ? '#FFD23F' : '#fff'}" fill-opacity="${on ? 0.38 : k % 2 ? 0.14 : 0}" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>`);
        }
      }
      // night
      if (night) {
        const a = norm180(sunLon + 90);
        const parts = a + 180 <= 180 ? [[a, a + 180]] : [[a, 180], [-180, a - 180]];
        parts.forEach((p) => out.push(`<path d="${pathPoly(g, rect(p[0], p[1], -90, 90))}" fill="#040c26" fill-opacity=".52"/>`));
      }
      // graticule
      const lats = mode === 'grid' ? [-60, -30, 30, 60] : mode === 'directions' ? [10, 20, 30] : mode === 'scale' ? [-60, -30, 30, 60] : [];
      const lons = mode === 'grid' || mode === 'scale' || mode === 'time' ? [-150, -120, -90, -60, -30, 30, 60, 90, 120, 150] : mode === 'directions' ? [70, 80, 90] : [];
      const gstroke = 'stroke="#fff" stroke-opacity=".38" stroke-width=".8" fill="none"';
      let gd = '';
      lats.forEach((l) => { gd += g.flat ? pathFlatLine(g, D.lat(l)) : pathLine(g, D.lat(l)); });
      lons.forEach((l) => { gd += pathLine(g, D.lon(l)); });
      if (gd) out.push(`<path d="${gd}" ${gstroke}/>`);
      const specLat = mode === 'grid' ? LINES : mode === 'time' || mode === 'scale' ? [LINES[0]] : mode === 'zones' ? [LINES[0]] : [];
      const specLon = mode === 'grid' ? MERID : mode === 'time' || mode === 'scale' ? [MERID[0]] : mode === 'zones' ? [MERID[1], MERID[2]] : [];
      specLat.forEach((l) => out.push(`<path d="${g.flat ? pathFlatLine(g, D.lat(l.lat)) : pathLine(g, D.lat(l.lat))}" fill="none" stroke="${l.col}" stroke-width="${l.id === 'equator' ? 2.2 : 1.8}" ${l.dash ? 'stroke-dasharray="6 4"' : ''}/>`));
      specLon.forEach((l) => out.push(`<path d="${pathLine(g, D.lon(l.lon))}" fill="none" stroke="${l.col}" stroke-width="${l.id === 'prime' ? 2.4 : 1.8}" ${l.dash ? 'stroke-dasharray="6 4"' : ''}/>`));
      // the marker's own parallel and meridian (grid)
      if (mode === 'grid') {
        out.push(`<path d="${g.flat ? pathFlatLine(g, D.lat(S.mk.lat)) : pathLine(g, D.lat(S.mk.lat))}" fill="none" stroke="#FF6B57" stroke-width="1.6" stroke-opacity=".9"/>`);
        out.push(`<path d="${pathLine(g, D.lon(S.mk.lon))}" fill="none" stroke="#FF6B57" stroke-width="1.6" stroke-opacity=".9"/>`);
      }
      // directions: arrow home -> selected
      if (mode === 'directions' && S.sel) {
        const a = g.proj(home.lon, home.lat), b = g.proj(P[S.sel].lon, P[S.sel].lat), ang = Math.atan2(b.y - a.y, b.x - a.x), hx = 9;
        const ex = b.x - Math.cos(ang) * 6, ey = b.y - Math.sin(ang) * 6;
        out.push(`<path d="M${n1(a.x)} ${n1(a.y)}L${n1(ex)} ${n1(ey)}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/><path d="M${n1(a.x)} ${n1(a.y)}L${n1(ex)} ${n1(ey)}" stroke="#FF6B57" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 6"/>`);
        out.push(`<path d="M${n1(ex)} ${n1(ey)}L${n1(ex - hx * Math.cos(ang - 0.45))} ${n1(ey - hx * Math.sin(ang - 0.45))}L${n1(ex - hx * Math.cos(ang + 0.45))} ${n1(ey - hx * Math.sin(ang + 0.45))}Z" fill="#FF6B57" stroke="#fff" stroke-width="1.2"/>`);
      }
      // scale: arc home -> marker
      if (mode === 'scale') {
        const pts = arcPoints(home, S.mk, 2), d = g.flat ? pathFlatLine(g, pts) : pathLine(g, pts);
        out.push(`<path d="${d}" fill="none" stroke="#061233" stroke-width="5.5" stroke-linecap="round" stroke-opacity=".45"/><path d="${d}" fill="none" stroke="#FFD23F" stroke-width="3" stroke-linecap="round" stroke-dasharray="7 5"/>`);
      }
      // sun
      if (night) {
        const s = g.proj(sunLon, 0);
        if (s.v && (g.flat || s.c > 0.05)) {
          let rays = '';
          for (let i = 0; i < 8; i++) rays += `<line x1="0" y1="-15" x2="0" y2="-21" transform="rotate(${i * 45})" stroke="#FFD23F" stroke-width="3" stroke-linecap="round"/>`;
          out.push(`<g transform="translate(${n1(s.x)} ${n1(s.y)})"><circle r="26" fill="#FFD23F" fill-opacity=".25"/>${rays}<circle r="11" fill="#FFD23F" stroke="#F5B90A" stroke-width="2"/></g>`);
        }
      }
      // place dots
      const dotIds = mode === 'scale' || mode === 'directions' ? chips.concat(homeId) : chips;
      dotIds.forEach((id) => {
        const p = P[id], s = g.proj(p.lon, p.lat);
        if (!s.v || (!g.flat && s.c < 0.06)) return;
        const hot = S.sel === id, isH = id === homeId && (mode === 'directions' || mode === 'scale');
        out.push(`<g data-pl="${id}" style="cursor:pointer"><circle cx="${n1(s.x)}" cy="${n1(s.y)}" r="${g.flat && !g.region ? 11 : 12}" fill="transparent"/>${isH ? `<path d="${star(s.x, s.y, 8.5)}" fill="#FFD23F" stroke="#061233" stroke-width="1.6"/>` : `<circle cx="${n1(s.x)}" cy="${n1(s.y)}" r="${hot ? 5.5 : 4}" fill="${hot ? '#FF6B57' : '#fff'}" stroke="#061233" stroke-width="1.6"/>`}</g>`);
        if (g.region || hot || isH || (!g.flat && id === targetId && false)) { const left = mode === 'directions' && id !== homeId && p.lon < home.lon; out.push(`<text class="gl-lbl" x="${n1(s.x + (left ? -8 : 8))}" y="${n1(s.y - 7)}" font-size="${fs}" text-anchor="${left ? 'end' : 'start'}">${esc(T(p.n))}</text>`); }
      });
      // marker pin
      const showPin = mode !== 'directions';
      if (showPin) {
        const m = g.proj(S.mk.lon, S.mk.lat);
        if (m.v && (g.flat || m.c > 0.02)) {
          const k = g.flat && !g.region ? 1.35 : 1;
          out.push(`<g transform="translate(${n1(m.x)} ${n1(m.y)}) scale(${k})"><circle class="gl-pulse" r="9" fill="#FF6B57" fill-opacity=".5"/><path d="M0 0C-7-9-10-14-10-19a10 10 0 0 1 20 0c0 5-3 10-10 19z" fill="#FF6B57" stroke="#fff" stroke-width="2"/><circle cy="-19" r="3.6" fill="#fff"/></g>`);
        }
      }
      if (g.flat) out.push('</g>');
      // flat-map axis labels
      if (g.flat) {
        const lab = (x, y, t, anchor) => `<text class="gl-lbl" x="${n1(x)}" y="${n1(y)}" font-size="${g.region ? 11 : 14}" text-anchor="${anchor}" style="stroke-width:2.6px">${esc(t)}</text>`;
        if (g.region) {
          [10, 20, 30].forEach((l) => { const s = g.proj(66, l); out.push(lab(s.x + 4, s.y - 3, l + '° N', 'start')); });
          [70, 80, 90].forEach((l) => { const s = g.proj(l, 5); out.push(lab(s.x, s.y - 4, l + '° E', 'middle')); });
        } else {
          [-60, -30, 0, 30, 60].forEach((l) => { const s = g.proj(-180, l); out.push(lab(s.x - 3, s.y + 5, l === 0 ? '0°' : Math.abs(l) + (l > 0 ? 'N' : 'S'), 'end')); });
          for (let l = -150; l <= 150; l += 30) { const s = g.proj(l, -90); out.push(lab(s.x, s.y + 17, l === 0 ? '0°' : Math.abs(l) + (l > 0 ? 'E' : 'W'), 'middle')); }
          if (mode === 'zones') {
            const wide = (root.clientWidth || 800) >= 560;
            for (let k = -12; k <= 12; k++) {
              if (!wide && k % 2) continue;
              const lon = k === -12 ? -176 : k === 12 ? 176 : k * 15, s = g.proj(lon, 90);
              out.push(`<text x="${n1(s.x)}" y="${n1(s.y - 7)}" font-size="${wide ? 15 : 17}" text-anchor="middle" class="gl-lbl" style="stroke-width:2.4px;fill:#FFD23F">${k > 0 ? '+' : k < 0 ? '−' : ''}${Math.abs(k)}</text>`);
            }
            const s = g.proj(82.5, 90);
            out.push(`<text class="gl-lbl" x="${n1(s.x + 3)}" y="${n1(s.y + 22)}" font-size="14" style="fill:#FFB27A">IST</text>`);
          }
        }
      }
      // globe finish: limb shade and gloss
      if (!g.flat) out.push(`<circle cx="200" cy="200" r="${g.R}" fill="url(#${uid}-sh)" pointer-events="none"/><circle cx="200" cy="200" r="${g.R}" fill="url(#${uid}-gl)" pointer-events="none"/>`);
      // globe labels for the special lines
      if (!g.flat && mode === 'grid') {
        LINES.forEach((l) => { const s = g.proj(S.lon0 + 50, l.lat); if (s.c > 0.25) out.push(`<text class="gl-lbl" x="${n1(s.x)}" y="${n1(s.y - 4)}" font-size="11.5" text-anchor="middle">${esc(T(l.n))}</text>`); });
        [[MERID[0], -14], [MERID[1], -34], [MERID[2], -14]].forEach((m) => { const s = g.proj(m[0].lon, m[1]); if (s.c > 0.25) out.push(`<text class="gl-lbl" x="${n1(s.x)}" y="${n1(s.y)}" font-size="11.5" text-anchor="${s.x < 120 ? 'start' : s.x > 280 ? 'end' : 'middle'}">${esc(T(m[0].n).replace(/ \(.*/, '').replace(/ 82.*/, ' 82°30′'))}</text>`); });
      }
      sc.innerHTML = out.join('');
      svg.setAttribute('aria-label', T(T2('Earth map. Marker at ', 'पृथ्वी का मानचित्र। मार्कर यहाँ है: ')) + (mode === 'directions' ? T(home.n) : T(posT(S.mk.lat, S.mk.lon))));
    }

    // ---- panels
    const tg = (x) => esc(T(x));
    function bannerInfo() {
      const hn = home.n;
      if (mode === 'grid') {
        if (targetId) {
          const p = P[targetId];
          return S.found
            ? { ok: 1, t: T2(`Found it! ${p.n.en} is at about ${posT(p.lat, p.lon, d1).en}.`, `मिल गया! ${p.n.hi} लगभग ${posT(p.lat, p.lon, d1).hi} पर है।`) }
            : { t: T2(`Put the marker on ${p.n.en}. Use the two sliders, or tap the globe.`, `मार्कर को ${p.n.hi} पर रखो। दोनों स्लाइडर चलाओ या ग्लोब को छुओ।`) };
        }
        return { t: T2('Move the marker with the sliders, or tap the globe. Read its latitude and longitude.', 'मार्कर को स्लाइडर से चलाओ या ग्लोब को छुओ। उसका अक्षांश और देशांतर पढ़ो।') };
      }
      if (mode === 'time') return { t: T2('Turn the Earth and watch day and night move. The marker shows the Sun time at its place.', 'पृथ्वी को घुमाओ और दिन-रात को खिसकते देखो। मार्कर अपने स्थान का सूर्य-समय बताता है।') };
      if (mode === 'zones') return { t: T2('Pick a place, then turn the clock. Compare its time with India’s.', 'कोई स्थान चुनो, फिर घड़ी घुमाओ। उसका समय भारत के समय से मिलाओ।') };
      if (mode === 'directions') return { t: T2(`Turn to face a direction. Pick a place to see which way it is from ${hn.en}.`, `किसी दिशा में मुँह करो। चुनो कि ${hn.hi} से कोई स्थान किस दिशा में है।`) };
      return { t: T2(`Pick a place. How far is it from ${hn.en}, and how long is that line on a map?`, `कोई स्थान चुनो। वह ${hn.hi} से कितनी दूर है और मानचित्र पर वह रेखा कितनी लंबी होगी?`) };
    }
    function readGrid() {
      const el = q('.gl-read'); if (!el) return;
      const { lat, lon } = S.mk, H = HEAT[heatOf(lat)], sp = specialAt(lat, lon);
      const hn = lat > 0 ? T2('Northern Hemisphere', 'उत्तरी गोलार्ध') : lat < 0 ? T2('Southern Hemisphere', 'दक्षिणी गोलार्ध') : T2('On the Equator', 'भूमध्य रेखा पर');
      const he = lon === 0 ? T2('On the Prime Meridian', 'प्रधान याम्योत्तर पर') : Math.abs(lon) === 180 ? T2('On the 180° meridian', '180° याम्योत्तर पर') : lon > 0 ? T2('Eastern Hemisphere', 'पूर्वी गोलार्ध') : T2('Western Hemisphere', 'पश्चिमी गोलार्ध');
      el.innerHTML = `<div class="gl-big">${tg(posT(lat, lon))}</div><div class="gl-tags"><span class="gl-tag">${tg(hn)}</span><span class="gl-tag">${tg(he)}</span><span class="gl-tag"><span class="gl-dot" style="background:${H.col}"></span>${tg(H.n)}</span></div>`
        + `<div class="gl-sub">${tg(H.d)}${sp.length ? ` · <b>${esc(sp.map((x) => T(x)).join(', '))}</b>` : ''}</div>`;
    }
    function subjectTime(utc) {
      if (mode === 'time') return utc + 4 * S.mk.lon;
      if (mode === 'zones') return utc + zoneOff();
      return null;
    }
    const zoneOff = () => (S.sel ? P[S.sel].off : Math.round(S.mk.lon / 15) * 60);
    function readClocks() {
      const box = q('.gl-clks'); if (!box) return;
      let a, b, note;
      if (mode === 'time') {
        const off = 4 * S.mk.lon;
        a = { l: T2('Greenwich (0°)', 'ग्रीनविच (0°)'), off: 0 };
        b = { l: S.sel ? P[S.sel].n : T2(`Marker at ${lonT(S.mk.lon).en}`, `मार्कर: ${lonT(S.mk.lon).hi}`), off };
        note = off === 0 ? T2('The marker is on the Prime Meridian: same Sun time as Greenwich.', 'मार्कर प्रधान याम्योत्तर पर है: सूर्य-समय ग्रीनविच जैसा।')
          : T2(`${Math.abs(S.mk.lon)}° ${off > 0 ? 'east' : 'west'} × 4 minutes per degree = ${durT(off).en} ${off > 0 ? 'ahead of' : 'behind'} Greenwich.`, `${Math.abs(S.mk.lon)}° ${off > 0 ? 'पूर्व' : 'पश्चिम'} × 4 मिनट प्रति अंश = ग्रीनविच से ${durT(off).hi} ${off > 0 ? 'आगे' : 'पीछे'}।`);
      } else {
        const off = zoneOff();
        a = { l: T2('India (IST)', 'भारत (IST)'), off: 330 };
        b = { l: S.sel ? P[S.sel].n : T2(`Zone ${offT(off)}`, `क्षेत्र ${offT(off)}`), off };
        const df = off - 330;
        note = T2(`${S.sel ? P[S.sel].n.en : 'This zone'} keeps ${offT(off)}${S.sel ? ' (standard time)' : ''}. ${df === 0 ? 'Same time as India.' : `${durT(df).en} ${df > 0 ? 'ahead of' : 'behind'} India.`} IST is ${offT(330)}, from the 82°30′ E meridian.`,
          `${S.sel ? P[S.sel].n.hi : 'यह क्षेत्र'} ${offT(off)} रखता है${S.sel ? ' (मानक समय)' : ''}। ${df === 0 ? 'भारत जैसा ही समय।' : `भारत से ${durT(df).hi} ${df > 0 ? 'आगे' : 'पीछे'}।`} IST ${offT(330)} है, 82°30′ पूर्व याम्योत्तर से।`);
      }
      const card = (c) => {
        const m = S.utc + c.off, h = (((Math.floor(m) % 1440) + 1440) % 1440) / 60, day = h >= 6 && h < 18, dr = dayRel(S.utc, c.off);
        return `<div class="gl-clk">${clockSVG(m, T(c.l) + ' ' + T(clockT(m)))}<div><b>${tg(clockT(m))}</b><span>${tg(c.l)}</span><span>${day ? '☀ ' + tg(T2('Day', 'दिन')) : '☾ ' + tg(T2('Night', 'रात'))}${dr ? ' · ' + tg(DAYT[dr]) : ''}</span></div></div>`;
      };
      box.innerHTML = card(a) + card(b);
      q('.gl-tn').textContent = T(note);
      q('.gl-sv').textContent = T(T2('Time at Greenwich: ', 'ग्रीनविच में समय: ')) + T(clockT(S.utc)) + ' (' + hhmm(S.utc) + ')';
      const r = q('[data-spinr]'); if (r && document.activeElement !== r) r.value = String(Math.floor(S.utc / 15) * 15);
    }
    function readScale() {
      const el = q('.gl-read'); if (!el) return;
      const d = distKm(home, S.mk), cm = d / S.km, B = S.sel ? P[S.sel].n : posT(S.mk.lat, S.mk.lon), dd = Math.round(d / 10) * 10;
      el.innerHTML = `<div class="gl-big">${esc(T(home.n))} → ${esc(T(B))}</div><div class="gl-big" style="color:var(--royal,#1D4ED8)">${esc(T(T2(`about ${inr(dd)} km`, `लगभग ${inr(dd)} किमी`)))}</div>`
        + `<div class="gl-sub">${esc(T(T2(`That is ${n1(d / 111.19)}° of arc along the shortest path over the Earth (a great circle).`, `पृथ्वी की सतह पर सबसे छोटे रास्ते (बड़े वृत्त) पर यह ${n1(d / 111.19)}° की चाप है।`)))}</div>`;
      const W = 320, px = 28, shown = Math.min(cm, 10);
      let tk = '';
      for (let i = 0; i <= Math.min(10, Math.floor(cm)); i++) tk += `<line x1="${10 + i * px}" y1="14" x2="${10 + i * px}" y2="${i % 5 ? 24 : 30}" stroke="#1E293B" stroke-width="1.5"/><text x="${10 + i * px}" y="46" font-size="11" text-anchor="middle" fill="currentColor">${i}</text>`;
      const rul = q('.gl-ruler');
      rul.innerHTML = `<svg class="gl-rul" viewBox="0 0 ${W + 20} 56" role="img" aria-label="${esc(T(T2(`Ruler: ${n1(cm)} cm`, `पैमाना: ${n1(cm)} सेमी`)))}"><rect x="10" y="4" width="${n1(shown * px)}" height="10" rx="3" fill="#FFD23F" stroke="#B9791B"/>${tk}${cm > 10 ? '<text x="' + (W + 6) + '" y="12" font-size="14" fill="currentColor" font-weight="700">…</text>' : ''}</svg>`
        + `<div class="gl-sub"><b>${esc(T(T2(`On this map: ${n1(cm)} cm`, `इस मानचित्र पर: ${n1(cm)} सेमी`)))}</b>${cm > 10 ? esc(T(T2(' (longer than the ruler shown)', ' (दिखाए पैमाने से लंबी)'))) : ''} · ${esc(T(T2('Scale ratio', 'पैमाने का अनुपात')))} 1 : ${inr(S.km * 100000)}</div>`
        + `<div class="gl-note">${esc(T(T2('Map length = real distance ÷ km per cm. The fewer km per cm, the larger the scale and the more detail.', 'मानचित्र पर लंबाई = वास्तविक दूरी ÷ किमी प्रति सेमी। जितने कम किमी प्रति सेमी, उतना बड़ा पैमाना और उतना अधिक ब्योरा।')))}</div>`;
    }
    const dirName = (deg) => DIRS[sectorOf(deg)].n;
    function compassSVG() {
      const cx = 150, cy = 130, R = 84, pt = (deg, r) => [cx + r * Math.sin(deg * RAD), cy - r * Math.cos(deg * RAD)];
      let s = `<svg class="gl-cmp" viewBox="0 0 300 260" role="group" aria-label="${esc(T(T2('Compass', 'कंपास')))}">`;
      s += `<circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="${R - 8}" fill="#F3F7FF"/>`;
      const f0 = S.face - 22.5, f1 = S.face + 22.5, a = pt(f0, R + 2), b = pt(f1, R + 2);
      s += `<path d="M${cx} ${cy}L${n1(a[0])} ${n1(a[1])}A${R + 2} ${R + 2} 0 0 1 ${n1(b[0])} ${n1(b[1])}Z" fill="#FFD23F" fill-opacity=".6"/>`;
      for (let k = 0; k < 8; k++) {
        const deg = k * 45, long = k % 2 === 0, r1 = long ? R - 2 : R * 0.6, w = long ? 9 : 6, p0 = pt(deg, r1), l = pt(deg - 90, w), r = pt(deg + 90, w);
        s += `<path d="M${n1(p0[0])} ${n1(p0[1])}L${n1(cx + (l[0] - cx) * 0.9)} ${n1(cy + (l[1] - cy) * 0.9)}L${cx} ${cy}L${n1(cx + (r[0] - cx) * 0.9)} ${n1(cy + (r[1] - cy) * 0.9)}Z" fill="${k === 0 ? '#FF6B57' : long ? '#1D4ED8' : '#8AA4E8'}" stroke="#061233" stroke-width=".6"/>`;
      }
      if (S.sel) {
        const bb = bearing(home, P[S.sel]), e = pt(bb, R - 10);
        s += `<line x1="${cx}" y1="${cy}" x2="${n1(e[0])}" y2="${n1(e[1])}" stroke="#FF6B57" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="2 6"/><circle cx="${n1(e[0])}" cy="${n1(e[1])}" r="6" fill="#FF6B57" stroke="#fff" stroke-width="2"/>`;
      }
      s += `<g transform="rotate(${S.face} ${cx} ${cy})"><path d="M${cx} ${cy - 26}L${cx + 13} ${cy + 14}L${cx} ${cy + 6}L${cx - 13} ${cy + 14}Z" fill="#8B3DFF" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy - 5}" r="5" fill="#FFD2B0" stroke="#061233" stroke-width="1"/></g>`;
      const tgtK = S.sel ? sectorOf(bearing(home, P[S.sel])) : -1;
      for (let k = 0; k < 8; k++) {
        const deg = k * 45, p = pt(deg, R + 24), on = sectorOf(S.face) === k, lbl = lang() === 'hi' ? DIRS[k].hs : DIRS[k].s;
        s += `<g role="button" tabindex="0" data-face="${deg}" aria-label="${esc(T(T2('Face ', 'मुँह करो: ')) + T(DIRS[k].n))}" style="cursor:pointer"><circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="17" fill="${on ? '#FFD23F' : '#fff'}" stroke="${k === tgtK ? '#FF6B57' : '#1D4ED8'}" stroke-width="${k === tgtK ? 3.4 : 1.8}"/><text x="${n1(p[0])}" y="${n1(p[1] + 5)}" text-anchor="middle" font-size="${lbl.length > 2 ? 11 : 15}" font-weight="800" fill="#1E293B" style="font-family:var(--font-display,system-ui)">${esc(lbl)}</text></g>`;
      }
      s += `<text x="266" y="${cy + 38}" text-anchor="middle" font-size="12" font-weight="700" fill="#B9791B" style="font-family:var(--font-body,system-ui)">☀ ${esc(T(T2('Sunrise', 'सूर्योदय')))}</text><text x="34" y="${cy + 38}" text-anchor="middle" font-size="12" font-weight="700" fill="#B9791B" style="font-family:var(--font-body,system-ui)">☀ ${esc(T(T2('Sunset', 'सूर्यास्त')))}</text>`;
      return s + '</svg>';
    }
    function readDirections() {
      const box = q('.gl-cmp-box'); if (box) box.innerHTML = compassSVG();
      const f = q('.gl-face');
      if (f) {
        const n = (d) => T(dirName(d));
        let txt = T(T2(`You face ${n(S.face)}. Right hand: ${n(S.face + 90)}. Left hand: ${n(S.face - 90)}. Behind you: ${n(S.face + 180)}.`, `आपका मुँह ${n(S.face)} की ओर है। दायाँ हाथ: ${n(S.face + 90)}। बायाँ हाथ: ${n(S.face - 90)}। पीछे: ${n(S.face + 180)}।`));
        if (S.sel && sectorOf(bearing(home, P[S.sel])) === sectorOf(S.face)) txt += ' ' + T(T2(`You are facing ${P[S.sel].n.en}!`, `आप ${P[S.sel].n.hi} की ओर मुँह किए हैं!`));
        f.textContent = txt;
      }
      const el = q('.gl-read'); if (!el) return;
      if (!S.sel) { el.innerHTML = `<div class="gl-sub" style="margin:0">${tg(T2(`Pick a place below. The map shows an arrow from ${home.n.en}.`, `नीचे कोई स्थान चुनो। मानचित्र में ${home.n.hi} से एक तीर दिखेगा।`))}</div>`; return; }
      const p = P[S.sel], b = bearing(home, p), k = sectorOf(b), d = Math.round(distKm(home, p) / 10) * 10;
      el.innerHTML = `<div class="gl-big">${esc(T(T2(`${p.n.en} is ${DIRS[k].n.en} of ${home.n.en}`, `${p.n.hi}, ${home.n.hi} के ${DIRS[k].n.hi} में है`)))}</div>`
        + `<div class="gl-sub">${esc(T(T2(`About ${inr(d)} km away. The straight line points ${Math.round(b)}° clockwise from north.`, `लगभग ${inr(d)} किमी दूर। सीधी रेखा उत्तर से घड़ी की दिशा में ${Math.round(b)}° पर है।`)))}</div>`;
    }
    function renderQuiz() {
      const body = q('.gl-qbody'); if (!body || !questions.length) return;
      const n = questions.length, qq = questions[S.qi % n];
      q('.gl-qn').textContent = `${(S.qi % n) + 1} / ${n}`;
      let fb = '';
      if (S.answered) fb = `<b style="color:var(--good,#15803D)">✓ ${esc(T(T2('Correct!', 'सही!')))}</b> ${esc(T(qq.why))}<div class="gl-next"><button type="button" class="gl-btn" data-next>${esc(T(T2('Next question', 'अगला प्रश्न')))} →</button></div>`;
      else if (Object.keys(S.tried).length) fb = `<b style="color:var(--bad,#B91C1C)">${esc(T(T2('Not quite. Try another answer.', 'ठीक नहीं। दूसरा उत्तर चुनो।')))}</b>`;
      body.innerHTML = `<div class="gl-q">${esc(T(qq.q))}</div><div class="gl-opts">${qq.o.map((o, i) => `<button type="button" class="gl-opt${S.tried[i] ? ' bad' : ''}${S.answered && i === qq.a ? ' good' : ''}" data-opt="${i}"${S.tried[i] || S.answered ? ' disabled' : ''}>${esc(T(o))}</button>`).join('')}</div><div class="gl-fb" aria-live="polite">${fb}</div>`;
    }

    // ---- update everything on screen from the state
    function update() {
      if (destroyed) return;
      if (built !== lang()) { build(); return; }
      const bi = bannerInfo(), bn = q('.gl-banner');
      if (bn) { bn.classList.toggle('ok', !!bi.ok); q('.gl-bt').textContent = T(bi.t); q('.gl-banner .ic').textContent = bi.ok ? '✓' : '★'; }
      root.querySelectorAll('[data-sl]').forEach((el) => {
        const k = el.dataset.sl, v = k === 'lat' ? S.mk.lat : S.mk.lon;
        if (document.activeElement !== el || String(el.value) !== String(v)) el.value = String(v);
        const lbl = root.querySelectorAll(`[data-v="${k}"]`);
        lbl.forEach((x) => { x.textContent = T(k === 'lat' ? latT(v) : lonT(v)); });
      });
      root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
      const hb = q('[data-heat]'); if (hb) hb.setAttribute('aria-pressed', String(S.heat));
      root.querySelectorAll('[data-pl]').forEach((b) => { if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(S.sel === b.dataset.pl)); });
      root.querySelectorAll('[data-scale]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.scale === S.km)));
      const pl = q('[data-play]'); if (pl) { pl.setAttribute('aria-pressed', String(S.playing)); pl.textContent = S.playing ? '⏸' : '▶'; }
      if (mode === 'grid') readGrid();
      if (mode === 'time' || mode === 'zones') readClocks();
      if (mode === 'scale') readScale();
      if (mode === 'directions') readDirections();
      drawScene();
    }

    // ---- actions
    function glide(lon, lat) {
      if (S.view !== 'globe') return;
      if (viewStop) viewStop();
      const a = S.lon0, b = a + norm180(lon - a), c = S.lat0, d = clamp(lat, -60, 60);
      viewStop = tween(600, (t) => { const e = L.ease(t); S.lon0 = norm180(a + (b - a) * e); S.lat0 = c + (d - c) * e; drawScene(); }, () => { viewStop = null; });
    }
    function ensureVisible(force) {
      if (S.view !== 'globe') return;
      const g = geom();
      if (mode === 'scale') {
        const m = arcPoints(home, S.mk, 4), mid = m[Math.floor(m.length / 2)];
        if (force || g.proj(S.mk.lon, S.mk.lat).c < 0.25 || g.proj(home.lon, home.lat).c < 0.25) glide(mid[0], mid[1] * 0.7);
        return;
      }
      if (force || g.proj(S.mk.lon, S.mk.lat).c < 0.3) glide(S.mk.lon, S.mk.lat * 0.6 + S.lat0 * 0.4);
    }
    function checkLocated() {
      if (mode === 'directions') return;
      let hit = null;
      for (const id of targetId ? [targetId] : chips) { const p = P[id]; if (Math.abs(p.lat - S.mk.lat) <= 1.5 && Math.abs(norm180(p.lon - S.mk.lon)) <= 1.5) { hit = id; break; } }
      if (targetId) S.found = !!hit;
      if (hit && hit !== S.near) {
        S.near = hit; update();
        api.emit('located');
        api.record(`Found ${P[hit].n.en} at about ${posT(P[hit].lat, P[hit].lon, d1).en}`);
        if (targetId) api.celebrate();
      } else if (!hit) S.near = null;
    }
    function emitTime(utc) {
      const m = subjectTime(utc == null ? S.utc : utc);
      if (m == null) return;
      const s = hhmm(m);
      if (s !== S.lastTime) { S.lastTime = s; api.emit('time:' + s); api.record(`Time at the chosen place: ${s}`); }
    }
    function changed() { const f = S.found; update(); checkLocated(); if (S.found !== f) update(); emitTime(); }
    function setMarker(lat, lon, id) {
      S.mk = { lat: clamp(r5(lat), -90, 90), lon: clamp(r5(lon), -180, 180) };
      S.sel = id || null;
      if (id || mode === 'scale') ensureVisible(!!id); else ensureVisible(false);
      changed();
    }
    function pickPlace(id) {
      if (!api.allowed('place:' + id)) { api.nudge('place:' + id); return; }
      const p = P[id];
      if (mode === 'directions') { S.sel = id; update(); api.emit('located'); api.record(`Looked at ${p.n.en} from ${home.n.en}: ${DIRS[sectorOf(bearing(home, p))].n.en}`); return; }
      setMarker(p.lat, p.lon, id);
    }
    function turnView(dl, dp) {
      if (S.view !== 'globe') return;
      if (!api.allowed(turnKey)) { api.nudge(turnKey); return; }
      if (viewStop) { viewStop(); viewStop = null; }
      S.lon0 = norm180(S.lon0 + dl); S.lat0 = clamp(S.lat0 + dp, -80, 80); drawScene();
    }
    function setPlay(on) {
      S.playing = on; S._pt = 0;
      if (on) playRaf = requestAnimationFrame(playLoop);
      else if (playRaf) { cancelAnimationFrame(playRaf); playRaf = 0; }
    }
    function playLoop(ts) {
      if (!S.playing || destroyed) return;
      const dt = Math.min(100, ts - (S._pt || ts)); S._pt = ts;
      const old = S.utc; S.utc = (S.utc + dt * 0.075) % 1440;
      const bo = Math.floor(old / 15), bn = Math.floor(S.utc / 15);
      if (bn !== bo) emitTime(bn * 15);
      update();
      playRaf = requestAnimationFrame(playLoop);
    }
    function answer(i) {
      if (!api.allowed('answer')) { api.nudge('answer'); return; }
      const qq = questions[S.qi % questions.length];
      if (S.answered || S.tried[i]) return;
      if (i === qq.a) { S.answered = true; api.emit('answered:right'); api.record('Answered right: ' + qq.q.en); api.celebrate(); }
      else { S.tried[i] = true; api.emit('answered:wrong'); api.record('Answered wrong: ' + qq.q.en + ' (' + (typeof qq.o[i] === 'string' ? qq.o[i] : qq.o[i].en) + ')'); }
      renderQuiz();
      const nb = q('[data-next]'); if (nb) nb.focus({ preventScroll: true });
    }

    function onClick(e) {
      const t = e.target;
      if (!t.closest) return;
      let b;
      if ((b = t.closest('[data-pl]')) && root.contains(b)) { pickPlace(b.dataset.pl); return; }
      if ((b = t.closest('[data-opt]'))) { answer(+b.dataset.opt); return; }
      if (t.closest('[data-next]')) { S.qi++; S.answered = false; S.tried = {}; renderQuiz(); return; }
      if ((b = t.closest('[data-turn]'))) { const k = b.dataset.turn; turnView(k === 'L' ? -15 : k === 'R' ? 15 : 0, k === 'U' ? 12 : k === 'D' ? -12 : 0); return; }
      if ((b = t.closest('[data-view]'))) {
        const k = 'view:' + b.dataset.view;
        if (!api.allowed(k)) { api.nudge(k); return; }
        S.view = b.dataset.view; if (S.view === 'globe') ensureVisible(true); update(); return;
      }
      if (t.closest('[data-heat]')) { if (!api.allowed('heat:toggle')) { api.nudge('heat:toggle'); return; } S.heat = !S.heat; update(); return; }
      if ((b = t.closest('[data-scale]'))) { const k = 'scale:' + b.dataset.scale; if (!api.allowed(k)) { api.nudge(k); return; } S.km = +b.dataset.scale; update(); return; }
      if ((b = t.closest('[data-spin]'))) { if (!api.allowed('rotate')) { api.nudge('rotate'); return; } setPlay(false); S.utc = (S.utc + +b.dataset.spin + 1440) % 1440; changed(); return; }
      if (t.closest('[data-play]')) { if (!api.allowed('rotate')) { api.nudge('rotate'); return; } setPlay(!S.playing); update(); return; }
      if ((b = t.closest('[data-step]'))) { if (!api.allowed('rotate')) { api.nudge('rotate'); return; } S.face = (S.face + +b.dataset.step + 360) % 360; update(); api.record('Turned to face ' + DIRS[sectorOf(S.face)].n.en); return; }
      if ((b = t.closest('[data-face]'))) { if (!api.allowed('rotate')) { api.nudge('rotate'); return; } S.face = +b.dataset.face; update(); api.record('Turned to face ' + DIRS[sectorOf(S.face)].n.en); }
    }
    function onInput(e) {
      const el = e.target;
      if (el.dataset && el.dataset.sl) {
        const k = el.dataset.sl, key = 'slider:' + k;
        if (!api.allowed(key)) { api.nudge(key); update(); return; }
        const v = parseFloat(el.value);
        setMarker(k === 'lat' ? v : S.mk.lat, k === 'lat' ? S.mk.lon : v, null);
      } else if (el.hasAttribute && el.hasAttribute('data-spinr')) {
        if (!api.allowed('rotate')) { api.nudge('rotate'); update(); return; }
        setPlay(false); S.utc = clamp(parseFloat(el.value) || 0, 0, 1439); changed();
      }
    }
    function onKey(e) {
      const t = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && t.closest && t.closest('[data-face]')) { e.preventDefault(); t.closest('[data-face]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
      if (t.classList && t.classList.contains('gl-stage')) {
        const m = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key];
        if (m) { e.preventDefault(); turnView(m[0], m[1]); }
      }
    }
    // dragging the globe and tapping the map
    let pend = false;
    const redraw = () => { if (pend) return; pend = true; rafs.push(requestAnimationFrame(() => { pend = false; if (!destroyed) drawScene(); })); };
    function onDown(e) {
      const svg = e.target.closest && e.target.closest('.gl-svg');
      if (!svg || (e.button != null && e.button > 0)) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, svg, nudged: false };
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
        drag.moved = true;
        if (viewStop) { viewStop(); viewStop = null; }
        try { drag.svg.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        drag.svg.classList.add('gl-grab');
      }
      if (!drag.moved) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (S.view !== 'globe') return;
      if (!api.allowed(turnKey)) { if (!drag.nudged) { api.nudge(turnKey); drag.nudged = true; } return; }
      const k = 180 / Math.PI / ((172 * drag.svg.getBoundingClientRect().width) / 400);
      S.lon0 = norm180(S.lon0 - dx * k); S.lat0 = clamp(S.lat0 + dy * k, -80, 80);
      redraw();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null; d.svg.classList.remove('gl-grab');
      if (d.moved || e.type === 'pointercancel') return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el.closest && el.closest('[data-pl]')) return;
      if (mode === 'directions') return;
      const need = mode === 'zones' ? ['slider:long'] : ['slider:lat', 'slider:long'];
      for (const k of need) if (!api.allowed(k)) { api.nudge(k); return; }
      const rc = d.svg.getBoundingClientRect(), g = geom(), vw = g.flat ? g.W : 400, vh = g.flat ? g.H : 400;
      const p = invert(g, ((e.clientX - rc.left) / rc.width) * vw, ((e.clientY - rc.top) / rc.height) * vh);
      if (p) setMarker(p.lat, p.lon, null);
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    update();
    renderQuiz();
    S.lastTime = (() => { const m = subjectTime(S.utc); return m == null ? null : hhmm(m); })();
    for (const id of mode === 'directions' ? [] : targetId ? [targetId] : chips) { const p = P[id]; if (Math.abs(p.lat - S.mk.lat) <= 1.5 && Math.abs(norm180(p.lon - S.mk.lon)) <= 1.5) { S.near = id; break; } }
    if (S.view === 'globe') { const end = S.lon0; S.lon0 = end + 70; viewStop = tween(1000, (t) => { S.lon0 = norm180(end + 70 * (1 - L.ease(t))); drawScene(); }, () => { viewStop = null; }); }
    if (typeof ResizeObserver !== 'undefined') {
      let wasWide = (root.clientWidth || 800) >= 720;
      ro = new ResizeObserver(() => { const w = (root.clientWidth || 800) >= 720; if (w !== wasWide) { wasWide = w; sizeCheck(); } });
      ro.observe(root);
    }
    return {
      destroy() {
        destroyed = true;
        if (viewStop) viewStop();
        setPlay(false);
        rafs.forEach((r) => cancelAnimationFrame(r));
        if (ro) ro.disconnect();
        root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('keydown', onKey); root.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      },
    };
  }

  NCA_T.register({
    id: 'globe',
    css: CSS,
    validate(c) {
      const e = [];
      if (!c || typeof c !== 'object' || Array.isArray(c)) return ['config must be an object'];
      Object.keys(c).forEach((k) => { if (k !== 'mode' && k !== 'place') e.push('unknown key: ' + k); });
      if (!MODES.includes(c.mode)) e.push('mode: one of ' + MODES.join(', '));
      if (c.place != null) {
        if (typeof c.place !== 'string' || !has(P, c.place)) e.push('unknown place: ' + c.place + ' (use ' + Object.keys(P).join(', ') + ')');
        else if (c.mode === 'directions' && !P[c.place].in) e.push('directions: place must be an Indian city (' + Object.keys(P).filter((i) => P[i].in).join(', ') + ')');
      }
      return e;
    },
    keys(c) {
      const mode = c && MODES.includes(c.mode) ? c.mode : 'grid';
      const place = c && typeof c.place === 'string' && has(P, c.place) ? c.place : null;
      const ids = chipsFor(mode, place);
      const targets = ['rotate'].concat(ids.map((i) => 'place:' + i), ['answer']);
      if (mode === 'grid' || mode === 'time' || mode === 'scale') targets.push('slider:lat');
      if (mode !== 'directions') targets.push('slider:long');
      if (mode === 'grid' || mode === 'time' || mode === 'scale') targets.push('view:globe', 'view:flat');
      if (mode === 'time') targets.push('view:turn');
      if (mode === 'grid') targets.push('heat:toggle');
      if (mode === 'scale') SCALES.forEach((k) => targets.push('scale:' + k));
      const events = ['answered:right', 'answered:wrong'];
      if (mode !== 'directions' || true) events.unshift('located');
      if (mode === 'time' || mode === 'zones') events.push('time:*');
      return { targets, events };
    },
    demo: { mode: 'grid', place: 'delhi' },
    modes: MODES,
    places: Object.keys(P),
    // The pure model, for tests under Node.
    model: { P, distKm, bearing, sectorOf, heatOf, clockT, hhmm, offT, buildQuestions, chipsFor },
    mount(root, config, api) { return mount(root, config, api); },
  });
})();
