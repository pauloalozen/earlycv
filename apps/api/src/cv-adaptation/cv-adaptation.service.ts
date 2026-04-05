import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";
import { DatabaseService } from "../database/database.service";
import { CvAdaptationAiService } from "./cv-adaptation-ai.service";
import { CvAdaptationPaymentService } from "./cv-adaptation-payment.service";
import { CvAdaptationPdfService } from "./cv-adaptation-pdf.service";
import type {
  CreateCvAdaptationDto,
  FileUpload,
} from "./dto/create-cv-adaptation.dto";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";
import { createCvAdaptationResponseDto } from "./dto/cv-adaptation-response.dto";

@Injectable()
export class CvAdaptationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvAdaptationAiService)
    private readonly aiService: CvAdaptationAiService,
    @Inject(CvAdaptationPaymentService)
    private readonly paymentService: CvAdaptationPaymentService,
    @Inject(CvAdaptationPdfService)
    private readonly pdfService: CvAdaptationPdfService,
  ) {}

  async create(userId: string, dto: CreateCvAdaptationDto, file?: FileUpload) {
    let masterResumeId = dto.masterResumeId;
    let masterCvText: string | null = null;

    // Handle file upload path
    if (file) {
      // Extract text from PDF
      try {
        const { extractTextFromPdf } = await import("@earlycv/ai");
        masterCvText = await extractTextFromPdf(file.buffer);
      } catch (error) {
        throw new BadRequestException(
          `Failed to extract text from PDF: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      // Create master Resume record
      const masterResume = await this.database.resume.create({
        data: {
          userId,
          title: file.originalname.replace(".pdf", ""),
          kind: "master",
          status: "uploaded",
          sourceFileName: file.originalname,
          sourceFileType: "application/pdf",
          rawText: masterCvText,
        },
      });

      masterResumeId = masterResume.id;
    }

    // Require masterResumeId
    if (!masterResumeId) {
      throw new BadRequestException("masterResumeId or PDF file is required.");
    }

    // Verify masterResumeId ownership and get rawText
    const resume = await this.database.resume.findFirst({
      where: {
        id: masterResumeId,
        userId,
      },
    });

    if (!resume) {
      throw new NotFoundException("master resume not found");
    }

    if (!resume.rawText) {
      throw new BadRequestException(
        "master resume has no extracted text. Please re-upload.",
      );
    }

    // Use extracted text from file or from resume
    if (!masterCvText) {
      masterCvText = resume.rawText;
    }

    // Verify template exists if provided
    if (dto.templateId) {
      const template = await this.database.resumeTemplate.findUnique({
        where: { id: dto.templateId },
      });

      if (!template) {
        throw new NotFoundException("template not found");
      }
    }

    const adaptation = await this.database.cvAdaptation.create({
      data: {
        userId,
        masterResumeId,
        templateId: dto.templateId || null,
        jobDescriptionText: dto.jobDescriptionText,
        jobTitle: dto.jobTitle || null,
        companyName: dto.companyName || null,
        status: "analyzing",
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Call AI asynchronously (fire and forget for MVP)
    this.aiService.analyzeAndAdapt(adaptation, masterCvText).catch((err) => {
      console.error(
        `AI adaptation failed for ${adaptation.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return createCvAdaptationResponseDto(adaptation);
  }

  async list(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.database.cvAdaptation.findMany({
        where: { userId },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.database.cvAdaptation.count({
        where: { userId },
      }),
    ]);

    return {
      items: items.map((a) => createCvAdaptationResponseDto(a)),
      total,
    };
  }

  async getById(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        template: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    return createCvAdaptationResponseDto(adaptation);
  }

  async delete(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    // Delete adapted resume if it exists
    if (adaptation.adaptedResumeId) {
      await this.database.resume.delete({
        where: { id: adaptation.adaptedResumeId },
      });
    }

    // Delete adaptation record
    await this.database.cvAdaptation.delete({
      where: { id },
    });
  }

  async createCheckout(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.status !== "awaiting_payment") {
      throw new BadRequestException(
        `Adaptation must be in awaiting_payment status. Current status: ${adaptation.status}`,
      );
    }

    const intent = await this.paymentService.createIntent(
      adaptation.id,
      userId,
    );

    // Store payment reference and set status to pending
    await this.database.cvAdaptation.update({
      where: { id },
      data: {
        paymentStatus: "pending",
        paymentReference: intent.paymentReference,
        paymentAmountInCents: intent.amountInCents,
        paymentCurrency: intent.currency,
      },
    });

    return {
      checkoutUrl: intent.checkoutUrl,
      paymentReference: intent.paymentReference,
      amountInCents: intent.amountInCents,
      currency: intent.currency,
    };
  }

  async handleWebhook(provider: string, body: unknown) {
    const paymentReference = await this.paymentService.resolvePaymentReference(
      provider,
      body,
    );

    // Find adaptation by payment reference
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { paymentReference },
    });

    if (!adaptation) {
      console.warn(
        `Webhook received for unknown payment reference: ${paymentReference}`,
      );
      return { acknowledged: true };
    }

    // Update status to completed
    await this.database.cvAdaptation.update({
      where: { id: adaptation.id },
      data: {
        paymentStatus: "completed",
        paidAt: new Date(),
        status: "paid",
      },
    });

    // Trigger delivery pipeline (generate PDF, create adapted Resume)
    this.deliverAdaptation(adaptation.id).catch((err) => {
      console.error(
        `Delivery failed for adaptation ${adaptation.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    });

    return { acknowledged: true };
  }

  async downloadPdf(userId: string, id: string, res: Response): Promise<void> {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.paymentStatus !== "completed") {
      throw new BadRequestException(
        `Adaptation must be paid to download. Status: ${adaptation.paymentStatus}`,
      );
    }

    if (!adaptation.adaptedResumeId) {
      throw new BadRequestException("Adapted resume not yet generated");
    }

    // Generate PDF again (in production, retrieve from storage)
    const pdfBuffer = await this.pdfService.generateAdaptedPdf(
      adaptation.adaptedContentJson as CvAdaptationOutput,
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=cv-adaptado.pdf",
    );
    res.send(pdfBuffer);
  }

  async getContent(userId: string, id: string) {
    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("adaptation not found");
    }

    if (adaptation.paymentStatus !== "completed") {
      throw new BadRequestException(
        "Adaptation must be paid to view full content",
      );
    }

    return {
      adaptedContentJson: adaptation.adaptedContentJson,
    };
  }

  private async deliverAdaptation(adaptationId: string): Promise<void> {
    // Load adaptation with content
    const adaptation = await this.database.cvAdaptation.findUnique({
      where: { id: adaptationId },
      include: {
        masterResume: true,
        template: true,
      },
    });

    if (!adaptation?.adaptedContentJson) {
      throw new Error("Adaptation not found or has no content");
    }

    const output = adaptation.adaptedContentJson as CvAdaptationOutput;

    // Generate PDF
    await this.pdfService.generateAdaptedPdf(output);

    // Create adapted Resume record
    const adaptedResume = await this.database.resume.create({
      data: {
        userId: adaptation.userId,
        title: `${adaptation.masterResume.title} - Adaptado`,
        kind: "adapted",
        status: "reviewed",
        basedOnResumeId: adaptation.masterResumeId,
        templateId: adaptation.templateId,
        sourceFileName: `cv-adaptado.pdf`,
        sourceFileType: "application/pdf",
        rawText: `Adapted CV for: ${adaptation.jobTitle || "unknown job"}`,
      },
    });

    // Update adaptation with adapted resume and delivered status
    await this.database.cvAdaptation.update({
      where: { id: adaptationId },
      data: {
        adaptedResumeId: adaptedResume.id,
        status: "delivered",
      },
    });
  }
}
