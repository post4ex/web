// B2B Constants and Configuration
const B2B_CONSTANTS = {
    staticWeights: ['0.5', '0.5A'],
    dynamicWeights: ['3', '10', '25', '50', '100', '500', '1000', '2000', '5000', '10000'],
    standardModes: ['premium', 'express', 'airline', 'surface'],
    simplifiedZones: [
        { label: 'REGIONAL', zones: [1, 2] },
        { label: 'NCR', zones: [4] },
        { label: 'NORTH', zones: [3, 5, 6] },
        { label: 'METRO', zones: [7, 8] },
        { label: 'ROI', zones: [9, 10, 11, 12] },
        { label: 'EAST', zones: [13, 14] }
    ],
    percentFields: ['%_TOPAY_IF', '%_COD_IF', '%_FOV_IF', 'FUEL_CHARGES', 'DEV_CHARGES'],
    textFieldsToUppercase: ['B2B_NAME', 'B2B_ADDRESS', 'B2B_LANDMARK', 'B2B_CITY', 'B2B_STATE', 'ID_GST_PAN_ADHAR']
};
