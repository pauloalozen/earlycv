// Disparo imediato do pipeline canônico (seção 5 do relatório de fechamento,
// 2026-09-08): job persistido -> commit -> kick imediato -> polling; o cron
// de 15s (CvProcessingWorker/CvAnalysisWorker @Cron) vira só recuperação
// (worker morto entre commit e kick, kick que falhou, etc.), nunca mais o
// único gatilho.
//
// EventEmitter puro do Node (não @nestjs/event-emitter/EventEmitter2)
// deliberado: EventEmitterModule.forRoot() não está registrado em
// app.module.ts hoje (confirmado por grep — só um listener legado em
// posthog-integration usa EventEmitter2, potencialmente já quebrado por
// esse mesmo motivo, fora de escopo desta correção). Injetar
// CvProcessingWorker/CvAnalysisWorker diretamente no entrypoint criaria um
// ciclo de DI real (CvProcessingEntrypointService -> CvProcessingWorker ->
// CvAnalysisWorker -> CvAdaptationService -> CvProcessingEntrypointService,
// esta última já uma dependência opcional existente). Um EventEmitter
// singleton em nível de módulo ES, importado diretamente (nunca via
// @Inject), desacopla emissor de ouvinte sem entrar no grafo de DI do Nest —
// zero risco de ciclo, zero dependência de infraestrutura não verificada.
import { EventEmitter } from "node:events";

// Revisão de 2026-09-08 (correção de UX — job não pode depender só do cron
// de 15s): os dois eventos agora carregam o id do job específico como
// payload, nunca "algo mudou, vá escanear tudo". O listener chama
// CvProcessingWorker#triggerProcessing(jobId)/CvAnalysisWorker#
// triggerProcessingForCvProcessingJob(cvProcessingJobId) — claim atômico
// POR ID, o mesmo processJob()/processReadyJob() do cron, nunca um scan de
// lote (evita competir com backlog de outros jobs pending no sistema).
export const CV_PROCESSING_JOB_CREATED = "cv-processing-job-created"; // payload: cvProcessingJobId: string
export const CV_PROCESSING_JOB_READY = "cv-processing-job-ready"; // payload: cvProcessingJobId: string (o próprio CvProcessingJob, não um AnalysisJob)

class CvProcessingDispatchSignal extends EventEmitter {}

export const cvProcessingDispatchSignal = new CvProcessingDispatchSignal();
// Muitos requests concorrentes podem cada um adicionar um listener por
// worker de longa duração (singleton) — nunca por request. O default de 10
// do Node é conservador demais pro número de workers reais deste pipeline;
// eleva o teto só pra evitar o warning "MaxListenersExceededWarning" em
// cenários de teste que instanciam vários workers no mesmo processo.
cvProcessingDispatchSignal.setMaxListeners(50);
