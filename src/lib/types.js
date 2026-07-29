"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTAINER_DATA = void 0;
exports.mapContainerType = mapContainerType;
exports.CONTAINER_DATA = {
    '40hc': { id: '40hc', name: '40ft High Cube', width: 2352, length: 12032, height: 2698 },
    '40rf': { id: '40rf', name: '40ft Reefer', width: 2290, length: 11560, height: 2540 },
    '40std': { id: '40std', name: '40ft Standard', width: 2352, length: 12032, height: 2393 },
    '20std': { id: '20std', name: '20ft Standard', width: 2352, length: 5898, height: 2393 },
};
function mapContainerType(input) {
    var uc = (input || '').toUpperCase();
    if (uc.includes('40HC') || uc.includes('40FT HIGH') || uc === 'HC')
        return '40hc';
    if (uc.includes('20DV') || uc.includes('20FT') || uc.includes('20STD'))
        return '20std';
    if (uc.includes('40RF') || uc.includes('40FT REEFER') || uc.includes('40RH'))
        return '40rf';
    if (uc.includes('40DV') || uc.includes('40FT STANDARD') || uc === '40FT')
        return '40std';
    // Fallbacks
    if (uc.includes('40')) {
        if (uc.includes('HIGH'))
            return '40hc';
        if (uc.includes('RH'))
            return '40rf';
        return '40std';
    }
    if (uc.includes('20'))
        return '20std';
    return '40hc'; // Default
}
