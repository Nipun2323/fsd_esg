import type {
  ChatMessage,
  Company,
  EsgDataset,
  Framework,
  Report,
  ReportSectionKey,
} from '@/types'

/**
 * The contract between this frontend and the Python backend.
 *
 * Implement these endpoints in FastAPI (or Flask) over the same
 * database.py / calculator.py / ai_service.py functions the outline
 * already describes — no logic needs to move.
 */
export interface EsgApi {
  /** GET /companies */
  listCompanies(): Promise<Company[]>
  /** POST /companies */
  createCompany(input: Omit<Company, 'id' | 'years'>): Promise<Company>

  /** GET /companies/:id/data?year= */
  getDataset(companyId: number, year: number): Promise<EsgDataset>
  /** PUT /companies/:id/data?year= */
  saveDataset(dataset: EsgDataset): Promise<EsgDataset>
  /** POST /companies/:id/data/import  (multipart CSV or XLSX) */
  importDataset(companyId: number, year: number, file: File): Promise<EsgDataset>

  /** GET /companies/:id/reports?year= */
  getReport(companyId: number, year: number, framework: Framework): Promise<Report>
  /** POST /reports/:id/sections/:key/generate — calls ai_service.generate_section */
  generateSection(
    reportId: number,
    section: ReportSectionKey,
    signal?: AbortSignal,
  ): Promise<{ body: string; groundedIn: string[]; generatedAt: string }>
  /** PUT /reports/:id/sections/:key */
  saveSection(reportId: number, section: ReportSectionKey, body: string): Promise<void>
  /** POST /reports/:id/export → PDF bytes from pdf_service.py */
  exportPdf(reportId: number): Promise<Blob>

  /** POST /assistant/chat — grounded Q&A over the company's own numbers */
  chat(
    companyId: number,
    year: number,
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<ChatMessage>
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
