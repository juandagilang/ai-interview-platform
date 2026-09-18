import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import FitGapReportPage from "./FitGapReportPage";

vi.mock("@/services/portfolios", () => ({
  portfoliosApi: {
    getFitGap: vi.fn(),
    triggerFitGap: vi.fn(),
    regenerateFitGap: vi.fn(),
    exportPortfolio: vi.fn(),
  },
}));

vi.mock("@/services/sessions", () => ({
  sessionsApi: { getPortfolio: vi.fn() },
}));

vi.mock("@/hooks/usePolling", () => ({ usePolling: vi.fn() }));

vi.mock("lucide-react", () => {
  const Icon = () => null;
  return {
    ArrowLeft: Icon,
    Download: Icon,
    Loader2: Icon,
    RefreshCw: Icon,
    Zap: Icon,
  };
});

import { portfoliosApi } from "@/services/portfolios";
import { sessionsApi } from "@/services/sessions";

const portfolio = {
  id: 7,
  session_id: 11,
  generation_status: "complete",
  skills: [
    {
      id: 1,
      skill_id: 10,
      skill_label: "Python",
      is_discovered: false,
      ai_level: "L3",
      ai_confidence: "high",
      evidence: [],
      competency_summary: "Strong Python experience.",
    },
    {
      id: 3,
      skill_id: 12,
      skill_label: "Agile Leadership",
      is_discovered: true,
      ai_level: "L2",
      ai_confidence: "low",
      evidence: [],
      competency_summary: "Led squads in startup environments.",
    },
  ],
  overrides: [],
};

const report = {
  id: 1,
  portfolio_id: 7,
  vacancy_id: 5,
  skill_comparisons: [
    { skill_label: "Python", required_level: 3, candidate_level: 3, result: "match", delta: 0 },
  ],
  culture_narrative: "Strong culture alignment.",
  overall_narrative: "Recommended for the role.",
  generated_at: "2026-01-01T00:00:00Z",
};

const staleBanner = "This report is based on outdated vacancy or skill data. A refreshed version is being generated.";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/assessments/2/sessions/11/portfolio/fitgap/5"]}>
      <Routes>
        <Route
          path="/assessments/:id/sessions/:sessionId/portfolio/fitgap/:vacancyId"
          element={<FitGapReportPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function mockPortfolio() {
  vi.mocked(sessionsApi.getPortfolio).mockResolvedValue({ data: { portfolio } } as any);
}

type ReportOverrides = {
  culture_narrative?: string | null;
  overall_narrative?: string | null;
};

function mockReport(overrides: ReportOverrides = {}, meta?: { stale?: boolean }) {
  vi.mocked(portfoliosApi.getFitGap).mockResolvedValue({
    data: { report: { ...report, ...overrides }, meta },
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FitGapReportPage", () => {
  it("shows the loading skeleton until getPortfolio resolves", async () => {
    let resolvePortfolio: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePortfolio = resolve;
    });
    vi.mocked(sessionsApi.getPortfolio).mockReturnValueOnce(pending as any);
    vi.mocked(portfoliosApi.getFitGap).mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();

    expect(screen.queryByText("Fit/Gap Report")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();

    resolvePortfolio!({ data: { portfolio } });

    await waitFor(() => expect(screen.getByText("Fit/Gap Report")).toBeInTheDocument());
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("renders the heading and both narrative cards when both narratives are present", async () => {
    mockPortfolio();
    mockReport();

    renderPage();

    await waitFor(() => expect(screen.getByText("Fit/Gap Report")).toBeInTheDocument());
    expect(screen.getByText("Culture & Competency Fit")).toBeInTheDocument();
    expect(screen.getByText("Overall Recommendation")).toBeInTheDocument();
    expect(screen.getByText(report.culture_narrative)).toBeInTheDocument();
    expect(screen.getByText(report.overall_narrative)).toBeInTheDocument();
  });

  it("renders only the Culture & Competency Fit card when overall_narrative is null", async () => {
    mockPortfolio();
    mockReport({ overall_narrative: null });

    renderPage();

    await waitFor(() => expect(screen.getByText("Culture & Competency Fit")).toBeInTheDocument());
    expect(screen.queryByText("Overall Recommendation")).not.toBeInTheDocument();
  });

  it("renders only the Overall Recommendation card when culture_narrative is null", async () => {
    mockPortfolio();
    mockReport({ culture_narrative: null });

    renderPage();

    await waitFor(() => expect(screen.getByText("Overall Recommendation")).toBeInTheDocument());
    expect(screen.queryByText("Culture & Competency Fit")).not.toBeInTheDocument();
  });

  it("shows the stale banner when getFitGap returns meta.stale true", async () => {
    mockPortfolio();
    mockReport({}, { stale: true });

    renderPage();

    await waitFor(() => expect(screen.getByText(staleBanner)).toBeInTheDocument());
  });

  it.each([false, undefined])("does not show the stale banner when meta.stale is %s", async (stale) => {
    mockPortfolio();
    mockReport({}, { stale });

    renderPage();

    await waitFor(() => expect(screen.getByText("Fit/Gap Report")).toBeInTheDocument());
    expect(screen.queryByText(staleBanner)).not.toBeInTheDocument();
  });

  it("calls triggerFitGap and shows the generating state when getFitGap returns 404", async () => {
    mockPortfolio();
    vi.mocked(portfoliosApi.getFitGap).mockRejectedValue({ response: { status: 404 } });
    vi.mocked(portfoliosApi.triggerFitGap).mockResolvedValue({ data: { status: "ok" } } as any);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Generating fit/gap report...")).toBeInTheDocument()
    );
    expect(portfoliosApi.triggerFitGap).toHaveBeenCalledWith(7, 5);
  });

  it("calls regenerateFitGap, hides the stale banner, and returns to generating state", async () => {
    mockPortfolio();
    mockReport({}, { stale: true });
    vi.mocked(portfoliosApi.regenerateFitGap).mockResolvedValue({ data: { status: "ok" } } as any);

    renderPage();

    await waitFor(() => expect(screen.getByText(staleBanner)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /regenerate/i }));

    await waitFor(() =>
      expect(screen.getByText("Generating fit/gap report...")).toBeInTheDocument()
    );
    expect(portfoliosApi.regenerateFitGap).toHaveBeenCalledWith(7, 5);
    expect(screen.queryByText(staleBanner)).not.toBeInTheDocument();
  });

  it("renders the Discovered Skills card when the portfolio has an is_discovered skill", async () => {
    mockPortfolio();
    mockReport();

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Discovered Skills (not in vacancy requirements)")).toBeInTheDocument()
    );
    expect(screen.getByText("Agile Leadership")).toBeInTheDocument();
  });

  it("does not render the Discovered Skills card when the portfolio has no is_discovered skill", async () => {
    vi.mocked(sessionsApi.getPortfolio).mockResolvedValue({
      data: { portfolio: { ...portfolio, skills: [portfolio.skills[0]] } },
    } as any);
    mockReport();

    renderPage();

    await waitFor(() => expect(screen.getByText("Fit/Gap Report")).toBeInTheDocument());
    expect(screen.queryByText("Discovered Skills (not in vacancy requirements)")).not.toBeInTheDocument();
  });

  it("renders the Skill Comparison card when a report exists", async () => {
    mockPortfolio();
    mockReport();

    renderPage();

    await waitFor(() => expect(screen.getByText("Skill Comparison")).toBeInTheDocument());
    expect(screen.getByText("Python")).toBeInTheDocument();
  });
});