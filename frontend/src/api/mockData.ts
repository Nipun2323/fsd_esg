import type { Company, EsgDataset } from '@/types'

export const COMPANIES: Company[] = [
  {
    id: 1,
    name: 'Aranya Textiles Pvt Ltd',
    industry: 'Textiles & Apparel',
    employees: 184,
    country: 'India',
    currency: 'INR',
    years: [2023, 2024, 2025],
  },
  {
    id: 2,
    name: 'Nordwind Components GmbH',
    industry: 'Precision Engineering',
    employees: 92,
    country: 'Germany',
    currency: 'EUR',
    years: [2024, 2025],
  },
  {
    id: 3,
    name: 'Sahyadri Agro Foods',
    industry: 'Food Processing',
    employees: 310,
    country: 'India',
    currency: 'INR',
    years: [2023, 2024, 2025],
  },
]

type Values = Record<string, number | null>

const aranya: Record<number, Values> = {
  2023: {
    electricity_kwh: 742000, renewable_kwh: 41000, diesel_litres: 18400, petrol_litres: 4200,
    water_kl: 31200, water_recycled_kl: 3900, waste_total_t: 184, waste_recycled_t: 71,
    hazardous_waste_t: 9.4,
    employees_total: 171, employees_female: 62, women_in_management_pct: 18,
    training_hours: 2180, ltifr: 6, hours_worked: 352000, attrition_pct: 22.4,
    csr_spend: 410000, complaints_consumer: 34, supplier_assessed_pct: null,
    board_size: 6, board_female: 1, board_independent: 2,
    anti_corruption_policy: 1, whistleblower_policy: 0, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 0, board_esg_oversight: 0,
  },
  2024: {
    electricity_kwh: 768500, renewable_kwh: 96000, diesel_litres: 16100, petrol_litres: 4050,
    water_kl: 29800, water_recycled_kl: 6700, waste_total_t: 191, waste_recycled_t: 96,
    hazardous_waste_t: 8.1,
    employees_total: 178, employees_female: 69, women_in_management_pct: 21,
    training_hours: 3120, ltifr: 4, hours_worked: 366000, attrition_pct: 19.1,
    csr_spend: 520000, complaints_consumer: 27, supplier_assessed_pct: 34,
    board_size: 7, board_female: 2, board_independent: 3,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 1, board_esg_oversight: 1,
  },
  2025: {
    electricity_kwh: 731200, renewable_kwh: 188400, diesel_litres: 12800, petrol_litres: 3600,
    water_kl: 26400, water_recycled_kl: 9100, waste_total_t: 176, waste_recycled_t: 118,
    hazardous_waste_t: 6.9,
    employees_total: 184, employees_female: 78, women_in_management_pct: 27,
    training_hours: 4410, ltifr: 2, hours_worked: 378000, attrition_pct: 15.6,
    csr_spend: 680000, complaints_consumer: 19, supplier_assessed_pct: 58,
    board_size: 7, board_female: 2, board_independent: 3,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 0, board_esg_oversight: 1,
  },
}

const nordwind: Record<number, Values> = {
  2024: {
    electricity_kwh: 412000, renewable_kwh: 164000, diesel_litres: 6200, petrol_litres: 2100,
    water_kl: 4800, water_recycled_kl: 1400, waste_total_t: 62, waste_recycled_t: 44,
    hazardous_waste_t: 3.2,
    employees_total: 88, employees_female: 24, women_in_management_pct: 17,
    training_hours: 1860, ltifr: 1, hours_worked: 162000, attrition_pct: 9.2,
    csr_spend: 24000, complaints_consumer: 6, supplier_assessed_pct: 61,
    board_size: 5, board_female: 1, board_independent: 2,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 0, board_esg_oversight: 1,
  },
  2025: {
    electricity_kwh: 398000, renewable_kwh: 231000, diesel_litres: 4900, petrol_litres: 1800,
    water_kl: 4350, water_recycled_kl: 1950, waste_total_t: 58, waste_recycled_t: 47,
    hazardous_waste_t: 2.4,
    employees_total: 92, employees_female: 28, women_in_management_pct: 22,
    training_hours: 2240, ltifr: 0, hours_worked: 171000, attrition_pct: 7.8,
    csr_spend: 31000, complaints_consumer: 4, supplier_assessed_pct: 74,
    board_size: 5, board_female: 2, board_independent: 2,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 0, board_esg_oversight: 1,
  },
}

const sahyadri: Record<number, Values> = {
  2023: {
    electricity_kwh: 1240000, renewable_kwh: 0, diesel_litres: 42000, petrol_litres: 8100,
    water_kl: 184000, water_recycled_kl: 12000, waste_total_t: 640, waste_recycled_t: 180,
    hazardous_waste_t: 14,
    employees_total: 288, employees_female: 131, women_in_management_pct: 12,
    training_hours: 2900, ltifr: 11, hours_worked: 596000, attrition_pct: 31.2,
    csr_spend: 890000, complaints_consumer: 88, supplier_assessed_pct: null,
    board_size: 8, board_female: 1, board_independent: 2,
    anti_corruption_policy: 1, whistleblower_policy: 0, grievance_mechanism: 0,
    corruption_cases: 1, data_breaches: 0, board_esg_oversight: 0,
  },
  2024: {
    electricity_kwh: 1310000, renewable_kwh: 74000, diesel_litres: 39500, petrol_litres: 7600,
    water_kl: 176000, water_recycled_kl: 24000, waste_total_t: 668, waste_recycled_t: 268,
    hazardous_waste_t: 12.5,
    employees_total: 301, employees_female: 142, women_in_management_pct: 15,
    training_hours: 4200, ltifr: 8, hours_worked: 622000, attrition_pct: 27.5,
    csr_spend: 1120000, complaints_consumer: 71, supplier_assessed_pct: 21,
    board_size: 8, board_female: 2, board_independent: 3,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 2, board_esg_oversight: 1,
  },
  2025: {
    electricity_kwh: 1288000, renewable_kwh: 212000, diesel_litres: 34100, petrol_litres: 6900,
    water_kl: 158000, water_recycled_kl: 41000, waste_total_t: 651, waste_recycled_t: 352,
    hazardous_waste_t: 10.1,
    employees_total: 310, employees_female: 154, women_in_management_pct: 19,
    training_hours: 5880, ltifr: 5, hours_worked: 641000, attrition_pct: 23.8,
    csr_spend: 1340000, complaints_consumer: 54, supplier_assessed_pct: 44,
    board_size: 9, board_female: 3, board_independent: 4,
    anti_corruption_policy: 1, whistleblower_policy: 1, grievance_mechanism: 1,
    corruption_cases: 0, data_breaches: 0, board_esg_oversight: 1,
  },
}

export const DATASETS: Record<number, Record<number, Values>> = {
  1: aranya,
  2: nordwind,
  3: sahyadri,
}

export const emptyDataset = (companyId: number, year: number): EsgDataset => ({
  companyId,
  year,
  values: {},
})
