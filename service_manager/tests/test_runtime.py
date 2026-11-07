"""Integration tests: real processes, real process trees, real ports."""

from __future__ import annotations

import socket


from app.runtime.services import Engine
from conftest import fixture_cmd, free_port, pid_alive, project, svc, wait_until


def state(engine, p, s):
    return engine.get_service(p, s).state.value


async def test_start_ready_and_graceful_stop(engine, tmp_path):
    port = free_port()
    spec = project("p", [svc("web", fixture_cmd("sleeper.py", "--port", str(port)),
                             readiness={"type": "tcp", "port": port, "timeout_s": 10})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "web") == "HEALTHY", msg="HEALTHY")
    sup = engine.get_service("p", "web")
    pid = sup.handle.pid
    await wait_until(lambda: any("ready" in l.text for l in sup.logs.tail(50)), msg="log capture")

    await engine.project_action("p", "stop", None, "test")
    assert state(engine, "p", "web") == "STOPPED"
    assert not pid_alive(pid)
    await wait_until(lambda: any("graceful shutdown" in l.text for l in sup.logs.tail(50)),
                     msg="graceful shutdown message (Ctrl+C / SIGTERM delivered)")
    assert sup.desired == "STOPPED"


async def test_crash_restarts_then_fails(engine, tmp_path):
    spec = project("p", [svc("bad", fixture_cmd("crasher.py", "--after", "0.1", "--code", "2"),
                             restart_policy={"max": 2, "window_s": 60, "backoff": [0.1]})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "bad") == "FAILED", msg="FAILED")
    sup = engine.get_service("p", "bad")
    assert sup.restart_count == 2
    assert sup.last_exit_code == 2
    assert "gave up" in sup.message

    await engine.service_action("p", "bad", "reset", "test")  # reset clears the attempt window
    await wait_until(lambda: state(engine, "p", "bad") in ("STARTING", "BACKOFF", "FAILED") and sup.restart_count >= 3,
                     msg="restarted after reset")


async def test_exit_zero_long_running_is_not_restarted(engine, tmp_path):
    spec = project("p", [svc("once", fixture_cmd("crasher.py", "--after", "1.5", "--code", "0"))], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "once") == "EXITED", msg="EXITED")


async def test_stop_kills_whole_tree(engine, tmp_path):
    pidfile = tmp_path / "gc.pid"
    spec = project("p", [svc("tree", fixture_cmd("spawner.py", "--pidfile", str(pidfile)))], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: pidfile.exists() and pidfile.read_text().strip(), msg="grandchild pid")
    gc = int(pidfile.read_text())
    assert pid_alive(gc)
    await engine.project_action("p", "stop", None, "test")
    await wait_until(lambda: not pid_alive(gc), timeout=5, msg="grandchild killed")


async def test_orphaned_grandchild_is_cleaned_when_parent_crashes(engine, tmp_path):
    # npm exits but leaves vite holding the port: must be swept before restart
    pidfile = tmp_path / "gc.pid"
    spec = project("p", [svc("tree", fixture_cmd("spawner.py", "--pidfile", str(pidfile), "--exit-parent"),
                             restart_policy={"mode": "never"})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "tree") == "FAILED", msg="parent exit")
    gc = int(pidfile.read_text())
    await wait_until(lambda: not pid_alive(gc), timeout=5, msg="orphan swept")


async def test_stubborn_process_is_force_killed(engine, tmp_path):
    spec = project("p", [svc("stubborn", fixture_cmd("sleeper.py", "--ignore-signals"),
                             stop_policy={"timeout_s": 1})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "stubborn") == "HEALTHY", msg="HEALTHY")
    pid = engine.get_service("p", "stubborn").handle.pid
    await engine.project_action("p", "stop", None, "test")
    assert not pid_alive(pid)


async def test_dependencies_start_in_order(engine, tmp_path):
    port = free_port()
    spec = project("p", [
        svc("api", fixture_cmd("web.py", "--port", str(port), "--delay", "1"),
            readiness={"type": "http", "url": f"http://127.0.0.1:{port}/health", "timeout_s": 15}),
        svc("worker", fixture_cmd("sleeper.py"), depends_on=["api"]),
    ], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", ["worker"], "test")  # pulls in api
    await wait_until(lambda: state(engine, "p", "worker") == "WAITING_DEPS", msg="worker waits")
    await wait_until(lambda: state(engine, "p", "worker") == "HEALTHY", msg="worker healthy")
    api, worker = engine.get_service("p", "api"), engine.get_service("p", "worker")
    assert worker.started_at > api.started_at + 0.9


async def test_blocked_when_dependency_fails(engine, tmp_path):
    spec = project("p", [
        svc("db", fixture_cmd("crasher.py", "--code", "1"), restart_policy={"mode": "never"}),
        svc("api", fixture_cmd("sleeper.py"), depends_on=["db"]),
    ], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "api") == "BLOCKED", msg="BLOCKED")
    assert engine.get("p").state() == "DEGRADED"


async def test_one_shot_then_dependent(engine, tmp_path):
    spec = project("p", [
        svc("migrate", fixture_cmd("crasher.py", "--after", "0.3", "--code", "0"), kind="one_shot"),
        svc("app", fixture_cmd("sleeper.py"), depends_on=[{"id": "migrate", "condition": "completed"}]),
    ], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "app") == "HEALTHY", msg="app after migrate")
    assert state(engine, "p", "migrate") == "COMPLETED"


async def test_health_check_failure_restarts(engine, tmp_path):
    port = free_port()
    spec = project("p", [svc(
        "zombie", fixture_cmd("web.py", "--port", str(port), "--stop-after", "1.5"),
        readiness={"type": "tcp", "port": port},
        health_checks=[{"type": "http", "url": f"http://127.0.0.1:{port}/health",
                        "interval_s": 0.3, "failures": 2, "attempt_timeout_s": 0.5}],
        restart_policy={"max": 5, "backoff": [0.2]},
    )], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "zombie") == "HEALTHY", msg="HEALTHY")
    sup = engine.get_service("p", "zombie")
    first_pid = sup.handle.pid
    await wait_until(lambda: sup.restart_count >= 1, timeout=10, msg="restart on unhealthy")
    assert not pid_alive(first_pid)


async def test_port_conflict_detected(engine, tmp_path):
    port = free_port()
    hog = socket.socket()
    hog.bind(("127.0.0.1", port))
    hog.listen()
    try:
        spec = project("p", [svc("web", fixture_cmd("sleeper.py", "--port", str(port)),
                                 readiness={"type": "tcp", "port": port},
                                 restart_policy={"mode": "never"})], tmp_path)
        await engine.create_project(spec, "test")
        await engine.project_action("p", "start", None, "test")
        await wait_until(lambda: state(engine, "p", "web") == "FAILED", msg="FAILED")
        assert f"port {port} is already in use" in engine.get_service("p", "web").last_error
    finally:
        hog.close()


async def test_log_regex_readiness(engine, tmp_path):
    spec = project("p", [svc("vite", fixture_cmd("sleeper.py", "--delay", "0.5"),
                             readiness={"type": "log_regex", "pattern": "^ready$", "timeout_s": 10})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: state(engine, "p", "vite") == "HEALTHY", msg="ready via log")


async def test_log_rotation_under_flood(engine, tmp_path):
    spec = project("p", [svc("flood", fixture_cmd("flood.py"),
                             log_policy={"max_bytes": 1024 * 1024, "max_files": 2})], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    sup = engine.get_service("p", "flood")
    await wait_until(lambda: any("flood done" in l.text for l in sup.logs.tail(20)), timeout=60, msg="flood done")
    rotated = sup.log_path.with_name("output.log.1")
    assert rotated.exists()
    assert not sup.log_path.with_name("output.log.2").exists()  # max_files=2 -> current + .1
    # the tailer reads up to 8 MB per tick, then rotates: the file is bounded once it catches up
    await wait_until(lambda: sup.log_path.stat().st_size < 3 * 1024 * 1024, timeout=5, msg="rotated")
    assert state(engine, "p", "flood") == "HEALTHY"


async def test_services_survive_manager_restart_and_are_readopted(db, tmp_path):
    port = free_port()
    spec = project("p", [svc("web", fixture_cmd("sleeper.py", "--port", str(port)),
                             readiness={"type": "tcp", "port": port})], tmp_path)
    eng1 = Engine()
    await eng1.start()
    await eng1.create_project(spec, "test")
    await eng1.project_action("p", "start", None, "test")
    await wait_until(lambda: eng1.get_service("p", "web").state.value == "HEALTHY", msg="HEALTHY")
    pid = eng1.get_service("p", "web").handle.pid
    await eng1.shutdown(stop_services=False)  # manager dies, service must live
    assert pid_alive(pid)

    eng2 = Engine()
    await eng2.start()
    try:
        sup = eng2.get_service("p", "web")
        await wait_until(lambda: sup.state.value == "HEALTHY", msg="re-adopted")
        assert sup.handle.pid == pid and not sup.handle.owned
        await eng2.project_action("p", "stop", None, "test")
        assert not pid_alive(pid)
    finally:
        await eng2.shutdown(stop_services=True)


async def test_desired_running_restored_after_manager_restart(db, tmp_path):
    spec = project("p", [svc("web", fixture_cmd("sleeper.py"))], tmp_path)
    eng1 = Engine()
    await eng1.start()
    await eng1.create_project(spec, "test")
    await eng1.project_action("p", "start", None, "test")
    await wait_until(lambda: eng1.get_service("p", "web").state.value == "HEALTHY", msg="HEALTHY")
    await eng1.get_service("p", "web").kill()          # process dies...
    await eng1.shutdown(stop_services=False)           # ...while the manager is going down

    eng2 = Engine()
    await eng2.start()
    try:
        await wait_until(lambda: eng2.get_service("p", "web").state.value == "HEALTHY", msg="restarted")
    finally:
        await eng2.shutdown(stop_services=True)


async def test_manual_stop_is_respected_after_manager_restart(db, tmp_path):
    spec = project("p", [svc("web", fixture_cmd("sleeper.py"))], tmp_path)
    eng1 = Engine()
    await eng1.start()
    await eng1.create_project(spec, "test")
    await eng1.project_action("p", "start", None, "test")
    await wait_until(lambda: eng1.get_service("p", "web").state.value == "HEALTHY", msg="HEALTHY")
    await eng1.project_action("p", "stop", None, "test")
    await eng1.shutdown()

    eng2 = Engine()
    await eng2.start()
    try:
        import asyncio
        await asyncio.sleep(1.5)
        assert eng2.get_service("p", "web").state.value == "STOPPED"
    finally:
        await eng2.shutdown(stop_services=True)


async def test_config_apply_restarts_only_changed(engine, tmp_path):
    spec = project("p", [svc("a", fixture_cmd("sleeper.py")), svc("b", fixture_cmd("sleeper.py"))], tmp_path)
    await engine.create_project(spec, "test")
    await engine.project_action("p", "start", None, "test")
    await wait_until(lambda: engine.get("p").state() == "RUNNING", msg="RUNNING")
    pid_a = engine.get_service("p", "a").handle.pid
    pid_b = engine.get_service("p", "b").handle.pid

    new = project("p", [svc("a", fixture_cmd("sleeper.py"), env={"NEW": "1"}),
                        svc("b", fixture_cmd("sleeper.py")),
                        svc("c", fixture_cmd("sleeper.py"))], tmp_path)
    plan = await engine.update_project(new, "test", restart_changed=True)
    assert plan["changed"] == ["a"] and plan["added"] == ["c"] and plan["restarted"] == ["a"]
    await wait_until(lambda: state(engine, "p", "a") == "HEALTHY", msg="a restarted")
    assert engine.get_service("p", "a").handle.pid != pid_a
    assert engine.get_service("p", "b").handle.pid == pid_b
    assert state(engine, "p", "c") == "STOPPED"
