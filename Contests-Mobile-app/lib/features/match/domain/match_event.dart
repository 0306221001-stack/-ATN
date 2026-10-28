import 'match_models.dart';

/// Sự kiện realtime của một trận đấu, đã được lọc đúng trận và chuẩn hóa.
sealed class MatchEvent {
  const MatchEvent();
}

/// Tín hiệu "trận X vừa bắt đầu" dùng ở danh sách trận (không lọc theo trận).
class MatchStartSignal {
  const MatchStartSignal({
    required this.matchSlug,
    required this.matchId,
    required this.matchName,
  });

  final String matchSlug;
  final int? matchId;
  final String matchName;
}

/// `match:started` / `match:globalStarted`.
class MatchStartedEvent extends MatchEvent {
  const MatchStartedEvent({required this.matchName});

  final String matchName;
}

/// `match:questionShown`.
class QuestionShownEvent extends MatchEvent {
  const QuestionShownEvent({
    required this.question,
    required this.remainingTime,
  });

  final QuestionPayload question;
  final int remainingTime;
}

/// `timer:update`.
class TimerTickEvent extends MatchEvent {
  const TimerTickEvent({
    required this.remainingTime,
    required this.isActive,
    required this.isPaused,
  });

  final int remainingTime;
  final bool isActive;
  final bool isPaused;
}

/// `match:timerWarning` (còn 30, 10 hoặc 5 giây).
class TimerWarningEvent extends MatchEvent {
  const TimerWarningEvent({required this.remainingTime, this.message});

  final int remainingTime;
  final String? message;
}

/// `match:timeUp` / `timer:ended`.
class TimeUpEvent extends MatchEvent {
  const TimeUpEvent();
}

/// `match:ended`.
class MatchEndedEvent extends MatchEvent {
  const MatchEndedEvent();
}

/// `student:rescued`. Backend gửi lẫn id thí sinh và số báo danh, nên giữ
/// nguyên danh sách để nơi xử lý đối chiếu cả hai.
class RescuedEvent extends MatchEvent {
  const RescuedEvent({required this.ids, this.message});

  final List<int> ids;
  final String? message;
}
