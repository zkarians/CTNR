export type ContainerType = '40hc' | '40rf' | '40std' | '20std';

export interface ContainerDimensions {
    id: ContainerType;
    name: string;
    width: number;
    length: number;
    height: number;
}

export const CONTAINER_DATA: Record<ContainerType, ContainerDimensions> = {
    '40hc': { id: '40hc', name: '40ft High Cube', width: 2352, length: 12032, height: 2698 },
    '40rf': { id: '40rf', name: '40ft Reefer', width: 2294, length: 11558, height: 2209 },
    '40std': { id: '40std', name: '40ft Standard', width: 2352, length: 12032, height: 2393 },
    '20std': { id: '20std', name: '20ft Standard', width: 2352, length: 5898, height: 2393 },
};

export function mapContainerType(input: string): ContainerType {
    const uc = (input || '').toUpperCase();
    if (uc.includes('40HC') || uc.includes('40FT HIGH')) return '40hc';
    if (uc.includes('20DV') || uc.includes('20FT STANDARD')) return '20std';
    if (uc.includes('40RF') || uc.includes('40FT REEFER')) return '40rf';
    if (uc.includes('40DV') || uc.includes('40FT STANDARD')) return '40std';

    // Fallbacks
    if (uc.includes('40')) {
        if (uc.includes('HIGH')) return '40hc';
        if (uc.includes('REEFER')) return '40rf';
        return '40std';
    }
    if (uc.includes('20')) return '20std';
    return '40hc'; // Default
}

export interface Product {
    id: string;
    model_name: string;
    width: number;
    length: number;
    height: number;
    quantity: number;
    allow_rotate: boolean;  // 기본값: true (가로/세로 회전)
    allow_lay_down: boolean; // 선택값: false (눕히기 - 가로x높이 등)
}

export interface PackedItem {
    product: Product;
    x: number;
    y: number;
    z: number;
    w: number;
    l: number;
    h: number;
    orientation: 'std' | 'rotated' | 'lay_side' | 'lay_front';
}

export interface PackingResult {
    container: ContainerDimensions;
    items: PackedItem[];
    efficiency: number;
    unpacked: Product[];
}

export interface Job {
    id: number;
    job_name: string;
    container_type: ContainerType;
    etd?: string;
    cntr_no?: string;
    transporter?: string;
}

export interface JobFilters {
    startDate: string;
    endDate: string;
    productName: string;
    containerNo: string;
}
