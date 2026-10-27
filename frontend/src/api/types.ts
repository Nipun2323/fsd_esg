import type {
  ChatMessage,
  Company,
  Dashboard,
  EsgDataset,
  Framework,
  Report,
  ReportSectionKey,
  UploadResult,
  User,
} from '@/types'

/**
 * The contract between this frontend and the FastAPI backend in
 * ../backend. Every screen goes through this interface, so swapping the
 * mock implementation for the real one touches nothing else.
 */
export interface EsgApi {
  /* auth */
  login(username: string, password: string): Promise<{ token: string; user: User }>
  signup(input: {
    username: string
    password: string
    email?: string
    company_name?: string
    ticker?: string
    industry?: string
  }): Promise<{ token: string; user: User }>
  me(): Promise<User>

  /* companies — the database stays idle until a term is typed */
  searchCompanies(query: string): Promise<Company[]>
  getCompany(companyId: number): Promise<Company>

  /* one call per screen */
  getDashboard(companyId: number, year: number, framework: Framework): Promise<Dashboard>

  getDataset(companyId: number, year: number): Promise<EsgDataset>
  saveDataset(dataset: EsgDataset): Promise<EsgDataset>

  /* upload a report — the backend extracts metrics from it */
  uploadReport(companyId: number, year: number, file: File): Promise<UploadResult>

  getReport(companyId: number, year: number, framework: Framework): Promise<Report>
  generateSection(reportId: number, section: ReportSectionKey, signal?: AbortSignal): Promise<Report>
  saveSection(reportId: number, section: ReportSectionKey, body: string): Promise<Report>
  exportPdf(reportId: number): Promise<Blob>

  chat(
    messages: ChatMessage[],
    opts: { companyId?: number | null; year?: number | null },
    signal?: AbortSignal,
  ): Promise<ChatMessage>

  aiStatus(): Promise<{ enabled: boolean; model: string | null; note: string }>
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
