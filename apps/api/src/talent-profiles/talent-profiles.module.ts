import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import { TalentProfileCaptureService } from "./talent-profile-capture.service";

// TalentSubjectService é provido diretamente aqui (não via CvProcessingModule)
// pra evitar puxar todo o pipeline canônico de CV (worker, entrypoint,
// controller de jobs) só pra resolver TalentSubject no caminho legado
// (correção Fase 2F-corretiva, talent-profile-capture.service.ts). O
// serviço em si (talent-subjects/talent-subject.service.ts) não pertence
// estruturalmente a nenhum dos dois módulos — é stateless, seguro registrar
// em mais de um módulo (mesmo padrão de IngestionLockRepository em
// cv-processing.module.ts/monitor.module.ts).
@Module({
  imports: [DatabaseModule],
  providers: [TalentProfileCaptureService, TalentSubjectService],
  exports: [TalentProfileCaptureService],
})
export class TalentProfilesModule {}
