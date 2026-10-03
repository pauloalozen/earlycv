import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
} from "class-validator";

// Ordem completa de UMA etapa do quadro (kanban) de /candidaturas, do topo
// pra base, depois de um arraste. O limite acompanha o máximo que a página
// carrega por vez.
export class ReorderBoardDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}
