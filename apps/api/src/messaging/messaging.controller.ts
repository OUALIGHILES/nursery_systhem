import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import {
  CreateConversationDto,
  ListConversationsDto,
  MessageHistoryDto,
  SearchContactsDto,
} from './dto/messaging.dto.js';
import { MessagingGateway } from './messaging.gateway.js';
import { MessagingService } from './messaging.service.js';
import type { UploadedAttachment } from './messaging.types.js';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly gateway: MessagingGateway,
  ) {}

  @Get('conversations')
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsDto,
  ) {
    return this.messaging.listConversations(user, query);
  }

  @Post('conversations')
  createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.createConversation(
      user,
      dto.participantId,
      dto.childId,
    );
  }

  @Get('contacts')
  listContacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchContactsDto,
  ) {
    return this.messaging.listContacts(user, query.search);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Query() query: MessageHistoryDto,
  ) {
    return this.messaging.listMessages(user, conversationId, query);
  }

  @Post('conversations/:id/messages')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('attachments', 5, {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
    @Body('content') content: string | undefined,
    @UploadedFiles() files: UploadedAttachment[] = [],
  ) {
    const result = await this.messaging.createMessage(
      user,
      conversationId,
      content,
      files,
    );
    this.gateway.broadcastMessage(
      conversationId,
      result.message,
      result.recipientIds,
    );
    return result.message;
  }

  @Post('conversations/:id/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') conversationId: string,
  ) {
    const result = await this.messaging.markRead(user, conversationId);
    this.gateway.broadcastRead(conversationId, result);
    return result;
  }

  @Delete('conversations/:conversationId/messages/:messageId')
  async deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.messaging.deleteMessage(
      user,
      conversationId,
      messageId,
    );
    this.gateway.broadcastDeleted(conversationId, messageId);
    return result;
  }

  @Get(
    'conversations/:conversationId/messages/:messageId/attachments/:attachmentId',
  )
  async downloadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() response: Response,
  ) {
    const { attachment, file } = await this.messaging.getAttachment(
      user,
      conversationId,
      messageId,
      attachmentId,
    );
    const safeName = attachment.fileName.replace(/["\r\n]/g, '_');
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', attachment.fileSize);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`,
    );
    file.stream.on('error', (_error: Error) => {
      if (!response.headersSent) response.status(500).end();
    });
    file.stream.pipe(response);
  }
}
