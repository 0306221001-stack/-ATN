import { Server, Socket } from "socket.io";
import { logger } from "@/utils/logger";
import { verifyToken, JwtPayload } from "@/utils/jwt";
import { registerMatchControlEvents } from "./namespaces/matchControl.namespace";
import { registerStudentNamespaceEvents } from "./namespaces/student.namespace";
import { ExtendedError } from "socket.io/dist/namespace";
import { socketService } from "./SocketService";
import cookie from "cookie";
import { registerTestEvents } from "./events/test.events";
import { registerStudentEvents } from "./events/student.events";
import { registerMatchEvents } from "./events/match.events";
import { registerAudienceEvents } from "./events/audience.events";
import { timerService } from "./services/timer.service";
import { prisma } from "@/config/database";

// Extend Socket interface to include user and contestant info
interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
  contestantId?: number;
  matchId?: number;
}

/**
 * Middleware xác thực kết nối Socket.IO bằng JWT trong cookie httpOnly
 */
export const authMiddleware = async (
  socket: Socket,
  next: (err?: ExtendedError) => void
) => {
  try {
    const rawCookie = socket.handshake.headers.cookie;

    if (!rawCookie) {
      logger.warn(`❌ [BE] Không có cookie. Socket ID: ${socket.id}`);
      return next(new Error("Authentication error: No cookie"));
    }

    const parsed = cookie.parse(rawCookie);

    const token = parsed.accessToken;
    console.log(
      "🔑 [BE] AccessToken tìm thấy trong cookie:",
      token ? `${token.substring(0, 30)}...` : "KHÔNG TÌM THẤY"
    );

    if (!token) {
      console.log(
        `❌ [BE] Không tìm thấy accessToken trong cookie. Socket ID: ${socket.id}`
      );
      logger.warn(
        `❌ [BE] Không tìm thấy accessToken trong cookie. Socket ID: ${socket.id}`
      );
      return next(new Error("Authentication error: Token not found"));
    }

    console.log(
      `✅ [BE] Đã nhận accessToken từ FE cho socket ${socket.id}:`,
      token.substring(0, 50) + "..."
    );
    logger.info(`[BE] Đã nhận accessToken từ FE: ${token}`);

    console.log("🔍 [BE] Đang verify token...");
    const payload = verifyToken(token) as JwtPayload;
    console.log(`✅ [BE] Payload giải mã thành công:`, {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      email: payload.email,
    });
    logger.info(`[BE] Payload giải mã từ token:`, payload);

    // Validate user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      console.log(
        `❌ [BE] User không tồn tại hoặc bị vô hiệu hóa. UserId: ${payload.userId}, User found:`,
        user
      );
      logger.warn(
        `❌ [BE] Không tìm thấy user hoặc user bị vô hiệu hóa: ${payload.userId}`
      );
      return next(
        new Error("Authentication error: User not found or inactive")
      );
    }

    console.log(
      `✅ [BE] User hợp lệ: ID=${user.id}, role=${user.role}, active=${user.isActive}`
    );

    // For Student role, validate contestant exists
    if (payload.role === "Student") {
      console.log(
        `🎓 [BE] User là Student, tìm kiếm contestant cho userId: ${payload.userId}`
      );
      console.log(
        `🔍 [BE] Tìm contestant cho Student userId: ${payload.userId}`
      );

      const contestant = await prisma.contestant.findFirst({
        where: {
          student: {
            userId: payload.userId,
          },
        },
        include: {
          student: {
            select: { id: true, fullName: true, studentCode: true },
          },
          contest: {
            include: {
              round: {
                include: {
                  matches: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      });

      console.log(
        "🔍 [BE] Kết quả tìm contestant:",
        contestant
          ? {
              id: contestant.id,
              studentName: contestant.student.fullName,
              studentCode: contestant.student.studentCode,
              contestId: contestant.contestId,
            }
          : "KHÔNG TÌM THẤY"
      );

      if (!contestant) {
        console.log(
          `❌ [BE] Không tìm thấy contestant cho student với userId: ${payload.userId}`
        );
        logger.warn(
          `❌ [BE] Không tìm thấy contestant cho student với userId: ${payload.userId}`
        );
        return next(new Error("Authentication error: Contestant not found"));
      }

      console.log(
        `✅ [BE] Đã tìm thấy contestant: ID=${contestant.id} cho student: ${contestant.student.fullName} (${contestant.student.studentCode})`
      );

      // Attach contestant info to socket
      (socket as AuthenticatedSocket).contestantId = contestant.id;

      console.log("🏆 [BE] Đang tìm trận đấu active cho contestant...");
      // Find active match for this contestant
      const activeMatch = await prisma.match.findFirst({
        where: {
          round: {
            contestId: contestant.contestId,
          },
          // Add more conditions here based on your match logic
        },
        orderBy: { createdAt: "desc" },
      });

      if (activeMatch) {
        console.log(
          `✅ [BE] Đã tìm thấy trận đấu active: ID=${activeMatch.id}, name=${activeMatch.name}`
        );
        logger.info(
          `[BE] Đã tìm thấy trận đấu active cho contestant: ${activeMatch.id}`
        );
        (socket as AuthenticatedSocket).matchId = activeMatch.id;
      } else {
        console.log("ℹ️ [BE] Không có trận đấu active nào cho contestant này");
      }

      console.log(`🎉 [BE] Student xác thực thành công:`, {
        socketId: socket.id,
        userId: payload.userId,
        username: payload.username,
        contestantId: contestant.id,
        matchId: activeMatch?.id || "none",
      });

      logger.info(
        `✅ Student authenticated: ${socket.id} | UserId: ${
          payload.userId
        } | Contestant: ${contestant.id} | Match: ${activeMatch?.id || "none"}`
      );
    } else {
      console.log(
        `✅ [BE] Non-student user xác thực thành công: ${payload.username} (${payload.role})`
      );
    }

    (socket as AuthenticatedSocket).user = payload;
    console.log(
      `🎯 [BE] Hoàn thành xác thực cho socket ${socket.id}, chuyển tiếp connection...`
    );
    next();
  } catch (err) {
    console.error(`💥 [BE] Lỗi xác thực token cho socket ${socket.id}:`, err);
    logger.error(`❌ Token verification failed: ${(err as Error).message}`);
    next(new Error("Authentication error"));
  }
};

/**
 * Khởi tạo và cấu hình Socket.IO server với namespace và xác thực
 */
export const initializeSocketIO = (io: Server) => {
  logger.info("🔌 Initializing Socket.IO server...");

  // Gán instance để dùng toàn cục
  socketService.setIO(io);

  // Initialize timer service
  timerService.setIO(io);

  // Namespace điều khiển trận đấu (dành cho Admin/Judge) - Đã tích hợp online control
  const matchControlNamespace = io.of("/match-control");

  // Enable authentication middleware
  matchControlNamespace.use(authMiddleware);

  matchControlNamespace.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const user = authSocket.user;

    logger.info(
      `✅ Connected to /match-control: ${socket.id} | User: ${user.username} (${user.userId}) | Role: ${user.role}`
    );

    // Đăng ký các sự kiện riêng cho namespace này (bao gồm cả online control)
    registerMatchControlEvents(io, authSocket);
    registerTestEvents(io, authSocket);

    // Register audience control events
    registerAudienceEvents(io, authSocket);

    socket.on("disconnect", reason => {
      logger.info(
        `❌ Disconnected from /match-control: ${socket.id}. Reason: ${reason}`
      );
    });
  });

  // Namespace dành riêng cho Student
  const studentNamespace = io.of("/student");
  studentNamespace.use(authMiddleware);

  studentNamespace.on("connection", async (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;

    // Register all student namespace events using the dedicated namespace handler
    await registerStudentNamespaceEvents(io, authSocket);
  });

  logger.info(
    "✅ Socket.IO server initialized with /match-control and /student namespaces."
  );
};
