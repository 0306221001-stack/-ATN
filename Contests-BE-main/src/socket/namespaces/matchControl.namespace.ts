// src/socket/namespaces/matchControl.namespace.ts
import { Server, Socket } from "socket.io";
import { logger } from "@/utils/logger";
import { registerQuestionEvents } from "../events/question.events";
import { registerScreenEvents } from "../events/screen.events";
import { registerTimerEvents } from "../events/timer.event";
import { registerUpdateStatusByAdminEvents } from "../events/Admin/updateStatus.events";
import { registerUpdateStatusByJudgeEvents } from "../events/Judge/updateStatus.events";
import { registerMatchEvents } from "../events/match.events";
import { verifyToken, JwtPayload } from "@/utils/jwt";
import cookie from "cookie";
import { registerAwardEvents } from "../events/award.envent";
import { registerMatchDiagramEvents } from "../events/matchDiagram.event";
import { registerAudienceEvents } from "../events/audience.events";
import { registerStatisticsEvents } from "../events/chart.envents";

const extractUserFromSocket = (socket: Socket): JwtPayload | null => {
  try {
    const rawCookie = socket.handshake.headers.cookie;
    if (!rawCookie) return null;

    const parsed = cookie.parse(rawCookie);
    const token = parsed.accessToken;
    if (!token) return null;

    const payload = verifyToken(token) as JwtPayload;

    return payload || null;
  } catch (error) {
    return null;
  }
};

export const registerMatchControlEvents = (io: Server, socket: Socket) => {
  const user = extractUserFromSocket(socket);

  // 🔥 NEW: Thêm logic authentication cho online control
  if (user) {
    (socket as any).user = user;
  }

  // Tham gia phòng của một trận đấu sử dụng matchId (cho match-control truyền thống)

  socket.on(
    "joinMatchRoom",
    (matchId: number, callback?: (response: any) => void) => {
      try {
        const roomName = `match-${matchId}`;
        socket.join(roomName);
        logger.info(`✅ Socket ${socket.id} joined room: ${roomName}`);

        if (user) {
          if (user.role === "Judge" && user.userId) {
            const judgeRoom = `match-${matchId}-judge-${user.userId}`;
            socket.join(judgeRoom);
            logger.info(` Judge ${user.userId} joined room: ${judgeRoom}`);
          }
        } else {
          logger.info(`Public viewer joined match ${matchId}`);
        }

        if (callback) {
          callback({
            success: true,
            message: `Joined match room ${roomName}`,
          });
        }
      } catch (err) {
        logger.error(`Failed to join room for match ${matchId}`, err);
        if (callback)
          callback({ success: false, message: "Failed to join match room." });
      }
    }
  );

  // 🔥 NEW: Thêm event onlineControl:joinMatch sử dụng slug
  socket.on(
    "onlineControl:joinMatch",
    async (data: { matchSlug: string }, callback?: (response: any) => void) => {
      try {
        if (!user || !["Admin", "Judge"].includes(user.role)) {
          if (callback) {
            callback({
              success: false,
              message:
                "Unauthorized: Only Admin or Judge can join online control",
            });
          }
          return;
        }

        // Import MatchService để lấy match từ slug
        const { MatchService } = await import("@/modules/match");
        const match = await MatchService.MatchControl(data.matchSlug);

        if (!match) {
          if (callback) {
            callback({
              success: false,
              message: "Match not found",
            });
          }
          return;
        }

        const controlRoomName = `match-${match.id}`;
        socket.join(controlRoomName);
        (socket as any).matchId = match.id;
        (socket as any).matchSlug = data.matchSlug;

        logger.info(
          `✅ [ONLINE CONTROL] Socket ${socket.id} joined room: ${controlRoomName} for slug: ${data.matchSlug}`
        );

        if (callback) {
          callback({
            success: true,
            message: `Joined control room ${controlRoomName}`,
            roomName: controlRoomName,
            matchId: match.id,
            matchSlug: data.matchSlug,
          });
        }
      } catch (error) {
        logger.error(
          `Failed to join online control room for slug ${data.matchSlug}`,
          error
        );
        if (callback) {
          callback({
            success: false,
            message: "Failed to join control room",
          });
        }
      }
    }
  );

  socket.on("leaveMatchRoom", (matchId: number) => {
    const roomName = `match-${matchId}`;

    socket.leave(roomName);
    logger.info(`🚪 Socket ${socket.id} left room: ${roomName}`);
  });

  // Rời khỏi phòng judge riêng
  socket.on("leaveJudgeRoom", (matchId: number) => {
    if (user && user.role === "Judge" && user.userId) {
      const judgeRoom = `match-${matchId}-judge-${user.userId}`;
      socket.leave(judgeRoom);
      logger.info(`🚪 Socket ${socket.id} left judge room: ${judgeRoom}`);
    } else {
      logger.warn(
        `⚠️ Socket ${socket.id} tried to leave judge room without being judge`
      );
    }
  });

  // 🔥 NEW: Handle disconnect for online control
  socket.on("disconnect", reason => {
    const matchId = (socket as any).matchId;
    const matchSlug = (socket as any).matchSlug;

    if (matchId && user) {
      socket.to(`match-${matchId}`).emit("admin:disconnected", {
        adminId: user.userId,
        adminName: user.username,
        matchId: matchId,
        matchSlug: matchSlug,
        reason: reason,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `❌ [ONLINE CONTROL] Admin ${user.username} disconnected from match ${matchSlug} (${matchId}). Reason: ${reason}`
      );
    }
  });

  // Đăng ký các module con trong namespace matchControl
  registerQuestionEvents(io, socket);
  registerScreenEvents(io, socket);
  registerTimerEvents(io, socket);
  registerUpdateStatusByAdminEvents(io, socket);
  registerAudienceEvents(io, socket);
  registerUpdateStatusByJudgeEvents(io, socket);

  // 🔥 NEW: Register match events cho cả match-control và online-control
  if (user && ["Admin", "Judge"].includes(user.role)) {
    registerMatchEvents(io, socket as any);
  }

  registerAwardEvents(io, socket);
  registerMatchDiagramEvents(io, socket);
  registerStatisticsEvents(io, socket);
};
