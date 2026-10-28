import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/app_routes.dart';
import '../../../core/widgets/status_views.dart';
import '../../rescue/presentation/rescue_screen.dart';
import '../domain/match_models.dart';
import 'match_controller.dart';
import 'match_screen.dart';

/// Màn hình của một trận đấu: phòng chờ, làm bài và kết thúc trong cùng một
/// route để việc quay lại đơn giản.
class WaitingRoomScreen extends ConsumerStatefulWidget {
  const WaitingRoomScreen({super.key, required this.matchSlug});

  final String matchSlug;

  @override
  ConsumerState<WaitingRoomScreen> createState() => _WaitingRoomScreenState();
}

class _WaitingRoomScreenState extends ConsumerState<WaitingRoomScreen>
    with WidgetsBindingObserver {
  String get matchSlug => widget.matchSlug;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Chống gian lận: rời khỏi ứng dụng (ra nền, đổi tab trên web) là một lần
  /// vi phạm. `inactive` bị bỏ qua vì nó cũng xảy ra khi chỉ kéo thanh thông
  /// báo hoặc hiện hộp thoại hệ thống.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final MatchController controller =
        ref.read(matchControllerProvider(matchSlug).notifier);
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        controller.onAppLeft();
      case AppLifecycleState.resumed:
        controller.onAppResumed();
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final MatchLiveState state = ref.watch(matchControllerProvider(matchSlug));
    final MatchController controller =
        ref.read(matchControllerProvider(matchSlug).notifier);

    ref.listen<String?>(
      matchControllerProvider(matchSlug).select((MatchLiveState s) => s.notice),
      (String? previous, String? next) {
        if (next == null) {
          return;
        }
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(next)));
        controller.dismissNotice();
      },
    );

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Quay lại',
          onPressed: () => _leave(context),
        ),
        title: Text(state.matchName.isEmpty ? 'Phòng thi' : state.matchName),
      ),
      body: SafeArea(
        child: Column(
          children: <Widget>[
            ConnectionBanner(
                state: state.connection, onRetry: controller.retry),
            Expanded(child: _buildBody(context, state, controller)),
          ],
        ),
      ),
    );
  }

  void _leave(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.studentDashboard);
    }
  }

  Widget _buildBody(
    BuildContext context,
    MatchLiveState state,
    MatchController controller,
  ) {
    if (state.isLoading) {
      return const LoadingView(message: 'Đang vào phòng thi...');
    }

    if (state.loadError != null) {
      return ErrorView(message: state.loadError!, onRetry: controller.retry);
    }

    switch (state.phase) {
      case MatchPhase.running:
        return MatchScreen(matchSlug: matchSlug);
      case MatchPhase.ended:
        return _EndedView(onBack: () => _leave(context));
      case MatchPhase.waiting:
        return _WaitingView(state: state);
    }
  }
}

class _WaitingView extends StatelessWidget {
  const _WaitingView({required this.state});

  final MatchLiveState state;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool eliminated = state.status == ContestantPlayStatus.eliminated;
    final bool banned = state.status == ContestantPlayStatus.banned;

    return ListView(
      padding: const EdgeInsets.all(24),
      children: <Widget>[
        const SizedBox(height: 24),
        Icon(
          banned
              ? Icons.block
              : eliminated
                  ? Icons.sentiment_dissatisfied_outlined
                  : Icons.hourglass_top_rounded,
          size: 72,
          color: banned || eliminated
              ? theme.colorScheme.error
              : theme.colorScheme.primary,
        ),
        const SizedBox(height: 16),
        Text(
          banned
              ? 'Bạn đã bị cấm thi'
              : eliminated
                  ? 'Bạn đã bị loại'
                  : 'Đang chờ câu hỏi',
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          banned || eliminated
              ? 'Bạn vẫn có thể ở lại phòng để theo dõi trận đấu.'
              : 'Giữ nguyên màn hình này. Câu hỏi sẽ tự hiện khi Ban tổ chức chiếu.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge,
        ),
        if (state.status != ContestantPlayStatus.playing) ...<Widget>[
          const SizedBox(height: 16),
          RescuePanel(status: state.status),
        ],
        const SizedBox(height: 24),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Quy định phòng thi',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                const Text('• Trả lời sai sẽ bị loại ngay khỏi trận đấu.'),
                const Text('• Kết quả chỉ hiển thị sau khi hết giờ.'),
                const Text('• Không rời ứng dụng trong lúc thi.'),
                if (state.registrationNumber != null) ...<Widget>[
                  const SizedBox(height: 12),
                  Text(
                    'Số báo danh của bạn: ${state.registrationNumber}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _EndedView extends StatelessWidget {
  const _EndedView({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.emoji_events_outlined,
              size: 72,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 16),
            Text(
              'Trận đấu đã kết thúc',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: onBack,
              child: const Text('Về danh sách trận'),
            ),
          ],
        ),
      ),
    );
  }
}
