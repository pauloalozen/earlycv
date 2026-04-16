import { render, screen } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResultadoPage from "./page.tsx";

// Mock modules to prevent crashes
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
    push: vi.fn(),
  })),
}));

vi.mock('@/components/app-header', () => ({
  AppHeader: (props: any) => &lt;
div;
data-testid = "app-header";
{
  ...props
}
/&,;gt;
}))

vi.mock('@/components/download-progress-overlay', () => (
{
  DownloadProgressOverlay: () => null,
}
))

vi.mock('@/lib/client-download', () => (
{
  downloadFromApi: vi.fn(),
}
))

vi.mock('@/lib/session-actions', () => (
{
  getAuthStatus: vi.fn(() =&gt;
  Promise.resolve({ isAuthenticated: false, userName: null, hasCredits: null });
  ),
}
))

vi.mock('@/lib/download-cta-copy', () => (
{
  getDownloadCtaCopy: vi.fn(() =&gt;
  ("Baixar");
  ),
}
))

vi.mock('react-dom', () => (
{
  createPortal: (children: React.ReactNode)
  =&gt
  &lt
  &gt
  children;
  &lt
  /&,;gt;
}
))

const mockData = {
  vaga: {
    cargo: "Desenvolvedor Fullstack",
    empresa: "Empresa Teste",
  },
  fit: {
    score: 72,
    headline: "Bom ajuste para a vaga",
    subheadline: "Seu perfil tem aderência média com pontos fortes em tech.",
  },
  projecao_melhoria: {
    score_atual: 72,
    score_pos_otimizacao: 97,
  },
  comparacao: {
    antes: "CV genérico sem foco.",
    depois: "CV otimizado com keywords.",
  },
  pontos_fortes: ["Experiência comprovada em React", "Liderança em squads"],
  lacunas: ["Falta Angular"],
  melhorias_aplicadas: ["Adicionadas métricas", "Keywords otimizadas"],
  ats_keywords: {
    presentes: ["React", "Node"],
    ausentes: ["Angular", "Docker"],
  },
  preview: {
    antes: "Experiência profissional\ngenérica.",
    depois: "Fullstack sênior React/Node com 5+ anos.",
  },
  // Gamify mock data
  metrics: {
    keywords: {
      match: 60,
      missing: ["Angular", "Docker"],
    },
    experience: {
      match: 85,
    },
  },
  deltas: {
    exp: "+25",
    keywords: "-15",
  },
  keywords: [
    { name: "Angular", presente: false, delta: -5 },
    { name: "Docker", presente: false, delta: -10 },
    { name: "React", presente: true, delta: 0 },
    { name: "Node", presente: true, delta: +3 },
  ],
} as any;

describe('ResultadoTestePage', () =&gt;
{
  beforeEach(() =&gt;
  vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() =&gt;
  JSON.stringify({ adaptedContentJson: mockData });
  ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
  )
    vi.stubGlobal('fetch', vi.fn())
    Object.defineProperty(window, 'location',
  search: "";
  ,
      writable: true,
  as;
  any;
  )
}
)

  afterEach(() =&gt
{
  vi.restoreAllMocks();
}
)

  it('renders gamified layout with metrics bars, deltas badges, keywords table, and paywall blur', () =&gt
{
  const { container } = render(&lt;
  ResultadoPage /&gt;
  )

    // Existing elements
    expect(screen.getByText('Análise para vaga: Desenvolvedor Fullstack')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()

    // New gamify expects - FAIL RED now
    expect(screen.getByTestId('metric-bar-keywords')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument() // keywords match %
    expect(screen.getByText('+25')).toBeInTheDocument() // deltas.exp
    expect(screen.getByTestId('keyword-table')).toBeInTheDocument()
    expect(screen.getByText('Angular')).toBeInTheDocument() // keyword name
    expect(screen.getByText('-5')).toBeInTheDocument() // delta in table

    // Paywall blur on numbers/bars
    expect(screen.getByTestId('paywall-blur-section')).toHaveClass('blur-md')

    // Snapshot for old vs new
    expect(container.firstChild).toMatchSnapshot()
}
)
})
