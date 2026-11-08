import { Request, Response } from "express";
import {
  UserService,
  CreateUserInput,
  UpdateUserInput,
  UserQueryInput,
} from "@/modules/user";
import { logger } from "@/utils/logger";
import { errorResponse, successResponse } from "@/utils/response";

import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { importExcel } from "../../utils/Excel";

import { prisma } from "@/config/database";

export default class UserController {
  static async creatUser(req: Request, res: Response): Promise<void> {
    try {
      const input: CreateUserInput = req.body;
      const existingUserName = await UserService.existingUserName(
        input.username
      );
      if (existingUserName) {
        throw new Error(`Tên tài khoản đã tồn tại `);
      }
      const existingEmail = await UserService.existingEmail(input.email);
      if (existingEmail) {
        throw new Error(`Email đã tồn tại `);
      }
      const hashPassword = await bcrypt.hash(input.password, 10);
      const user = await UserService.creatUser({
        ...input,
        password: hashPassword,
      });
      const data: any = {
        id: user.id,
        username: user.username,
        email: user.email,
        password: user.password,
        role: user.role,
        isActive: user.isActive,
      };
      res.json(successResponse(data, "Tạo tài khoản thành công"));
      logger.info(`Tạo khoản thành công ${user}`);
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
  static async getUserById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const user = await UserService.getUserById(Number(id));
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }
      const data: any = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      };
      logger.info(`Lấy thông tin người thành công ${user}`);
      res.json(successResponse(data, "Lấy thông tin người dùng thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
  static async UpdateUser(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const input: UpdateUserInput = req.body;

      const user = await UserService.getUserById(Number(id));
      if (input.email) {
        const existingEmail = await UserService.existingEmailForUpdate(
          input.email,
          Number(id)
        );
        if (existingEmail) {
          throw new Error("Email đã tồn tại");
        }
      }
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }

      if (input.role && input.role !== user.role) {
        if (user.role === "Judge") {
          const countGroups = await UserService.countGroupsByUserId(user.id);
          if (countGroups > 0) {
            throw new Error(
              `Không thể thay đổi vai trò của ${user.username} vì họ là trọng tài của ${countGroups} trận đấu`
            );
          }
        }

        if (user.role === "Student") {
          const student = await prisma.student.findFirst({
            where: { userId: user.id },
          });

          if (student) {
            const countContestants = await prisma.contestant.count({
              where: { studentId: student.id },
            });
            if (countContestants > 0) {
              throw new Error(
                `Không thể thay đổi vai trò của ${user.username} vì họ là thí sinh của ${countContestants} cuộc thi`
              );
            }
          }
        }
      }
      const userUpdate = await UserService.UpdateUser(user.id, input);
      if (!userUpdate) {
        throw new Error("Cập nhật thất bại ");
      }
      const data: any = {
        id: userUpdate.id,
        username: userUpdate.username,
        email: userUpdate.email,
        role: userUpdate.role,
        password: userUpdate.password,
        isActive: userUpdate.isActive,
      };
      res.json(successResponse(data, "Cập nhật tài khoản thành công"));
      logger.info(`Cập nhật ${user.username} thành công`);
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
  static async toggleActive(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const user = await UserService.getUserById(Number(id));
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }
      const updated = await UserService.UpdateUser(user.id, {
        isActive: !user.isActive,
      });
      if (!updated) {
        throw new Error("Cập nhật trạng thái thất bại");
      }
      const data = {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
      };
      res.json(
        successResponse(data, "Cập nhật trạng thái hoạt động thành công")
      );
      logger.info(`Cập nhật trạng thái hoạt động ${user.username} thành công`);
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
  static async getRoles(req: Request, res: Response): Promise<void> {
    try {
      const roles = Object.values(Role);
      logger.info(`Lấy danh sách vai trò người dùng thành công`);
      res.json(successResponse(roles, "Lấy danh sách vai trò thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const allowedRoles = ["Admin", "Judge", "Student"] as const;

      const role = allowedRoles.includes(req.query.role as any)
        ? (req.query.role as (typeof allowedRoles)[number])
        : undefined;

      const query: UserQueryInput = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 10,
        search: (req.query.search as string) || undefined,
        isActive:
          req.query.isActive !== undefined
            ? req.query.isActive === "true"
            : undefined,
        role: role,
      };
      const id = req.user?.userId;
      const data = await UserService.getAllUser(query, id);
      if (!data) {
        throw new Error("Không tìm thấy người dùng");
      }
      logger.info(`Lấy danh sách người dùng thành công`);
      res.json(
        successResponse(
          { user: data.users, pagination: data.pagination },
          "Lấy danh sách người dùng thành công"
        )
      );
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const user = await UserService.getUserById(Number(id));
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }

      if (user.role === "Student") {
        const student = await prisma.student.findFirst({
          where: { userId: user.id },
        });

        if (student) {
          const countContestants = await prisma.contestant.count({
            where: { studentId: student.id },
          });
          if (countContestants > 0) {
            throw new Error(
              `Không thể xoá ${user.username} vì họ là thí sinh của ${countContestants} cuộc thi`
            );
          }
        }
      }
      const countGroups = await UserService.countGroupsByUserId(user.id);
      if (countGroups > 0) {
        throw new Error(
          `Không thể xoá ${user.username} này vì họ là trọng tài của ${countGroups} trận đấu`
        );
      }

      const deleted = await UserService.deleteUser(user.id);
      if (!deleted) {
        throw new Error("Xoá người dùng thất bại");
      }
      res.json(successResponse({}, "Xoá người dùng thành công"));
      logger.info(`Xoá người dùng ${user.username} thành công`);
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async deleteUsers(req: Request, res: Response): Promise<void> {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids)) {
        throw new Error("Danh sách không hợp lệ");
      }

      const messages: { status: "success" | "error"; msg: string }[] = [];

      for (const id of ids) {
        const user = await UserService.getUserById(Number(id));
        if (!user) {
          messages.push({
            status: "error",
            msg: `Không tìm thấy người dùng với ID = ${id}`,
          });
          continue;
        }

        const countGroups = await UserService.countGroupsByUserId(user.id);
        if (countGroups > 0) {
          messages.push({
            status: "error",
            msg: `Không thể xoá "${user.username}" vì họ là trọng tài của ${countGroups} trận đấu`,
          });
          continue;
        }

        if (user.role === "Student") {
          const student = await prisma.student.findFirst({
            where: { userId: user.id },
          });

          if (student) {
            const countContestants = await prisma.contestant.count({
              where: { studentId: student.id },
            });
            if (countContestants > 0) {
              messages.push({
                status: "error",
                msg: `Không thể xoá "${user.username}" vì họ là thí sinh của ${countContestants} cuộc thi`,
              });
              continue;
            }
          }
        }

        const result = await UserService.deleteUser(user.id);
        if (!result) {
          messages.push({
            status: "error",
            msg: `Xoá người dùng "${user.username}" thất bại`,
          });
          continue;
        }

        messages.push({
          status: "success",
          msg: `Xoá người dùng "${user.username}" thành công`,
        });

        logger.info(`Đã xoá người dùng ${user.username}`);
      }

      res.json({
        success: true,
        messages,
      });
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async getListUser(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserService.getListUser();
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }
      logger.info(`Lấy thông tin người thành công ${user}`);
      res.json(successResponse(user, "Lấy danh sách người dùng thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async getListStudent(req: Request, res: Response): Promise<void> {
    try {
      const user = await UserService.getListStudent();
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }
      logger.info(`Lấy thông tin người thành công ${user}`);
      res.json(successResponse(user, "Lấy danh sách người dùng thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async getListStudentCurrent(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const id = req.params.userId;
      const user = await UserService.getListStudentCurrent(Number(id));
      if (!user) {
        throw new Error("Không tìm thấy người dùng");
      }
      logger.info(`Lấy thông tin người thành công ${user}`);
      res.json(successResponse(user, "Lấy danh sách người dùng thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }

  static async importExcel(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        throw new Error("Không có tệp để nhập");
      }

      const columns = importExcel(file);
      const errors: string[] = [];
      let data: CreateUserInput[] = [];

      for (const [index, column] of columns.entries()) {
        const input: CreateUserInput = {
          username: column.B,
          password: column.C,
          email: column.D,
          role: column.E as Role,
          isActive: true,
        };

        if (!input.username || !input.password || !input.email || !input.role) {
          const msg = `Dòng ${
            index + 2
          }: Thiếu thông tin bắt buộc (Tài khoản, mật khẩu, email)`;
          logger.warn(msg);
          errors.push(msg);
          continue;
        }

        const existingUserName = await UserService.existingUserName(
          input.username
        );
        if (existingUserName) {
          const msg = `Dòng ${index + 2}: Tài khoản '${
            input.username
          }' đã tồn tại`;
          logger.warn(msg);
          errors.push(msg);
          continue;
        }

        const existingEmail = await UserService.existingEmail(input.email);
        if (existingEmail) {
          const msg = `Dòng ${index + 2}: Email '${input.email}' đã tồn tại`;
          logger.warn(msg);
          errors.push(msg);
          continue;
        }

        const hashPassword = await bcrypt.hash(input.password, 10);
        data.push({
          ...input,
          password: hashPassword,
        });
      }

      if (errors.length > 0) {
        logger.warn("Một số lỗi đã xảy ra trong quá trình nhập dữ liệu");
        res.status(400).json({
          success: false,
          message: "Một số lỗi đã xảy ra trong quá trình nhập dữ liệu",
          errors,
        });
        return;
      }

      if (data.length === 0) {
        throw new Error("Không có dữ liệu hợp lệ để nhập");
      }

      const result = await UserService.createManyUsers(data);
      logger.info(`Nhập dữ liệu thành công ${result.count} người dùng`);
      res.json(successResponse(result.count, "Nhập dữ liệu thành công"));
    } catch (error) {
      logger.error((error as Error).message);
      res.status(400).json(errorResponse((error as Error).message));
    }
  }
}
