// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IncidentRegistry} from "../src/IncidentRegistry.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
    function assume(bool) external;
}

contract IncidentRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    IncidentRegistry registry;
    bytes32 constant ENDPOINT = keccak256("portaldot-evm-testnet");
    bytes32 constant REPORT = keccak256("report-1");
    bytes32 constant EVIDENCE = keccak256("failed-checks");
    bytes32 constant RECOVERY = keccak256("successful-checks");

    function setUp() public { registry = new IncidentRegistry(address(this)); }

    function testOpenAndResolvePreserveBothEvidenceHashesAndTimestamps() public {
        vm.warp(1000);
        uint256 id = registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        IncidentRegistry.Incident memory opened = registry.getIncident(id);
        require(id == 1 && opened.reporter == address(this), "report identity");
        require(opened.evidenceHash == EVIDENCE && opened.openedAt == 1000, "opening evidence");
        require(opened.status == IncidentRegistry.Status.Open && registry.activeIncident(ENDPOINT) == id, "open state");
        vm.warp(1200);
        registry.resolveIncident(id, RECOVERY);
        IncidentRegistry.Incident memory resolved = registry.getIncident(id);
        require(resolved.evidenceHash == EVIDENCE && resolved.resolutionHash == RECOVERY, "both hashes retained");
        require(resolved.openedAt == 1000 && resolved.resolvedAt == 1200, "both timestamps retained");
        require(resolved.status == IncidentRegistry.Status.Resolved && registry.activeIncident(ENDPOINT) == 0, "resolved state");
    }

    function testUnauthorizedMonitorCannotOpen() public {
        vm.prank(address(0x123));
        vm.expectRevert(IncidentRegistry.UnauthorizedReporter.selector);
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
    }

    function testUnauthorizedMonitorCannotResolve() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        vm.prank(address(0x123));
        vm.expectRevert(IncidentRegistry.UnauthorizedReporter.selector);
        registry.resolveIncident(1, RECOVERY);
    }

    function testRetryCannotCreateDuplicateReport() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(IncidentRegistry.ReportAlreadyExists.selector, 1));
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        require(registry.incidentCount() == 1, "duplicate count");
    }

    function testEndpointCannotHaveTwoOpenIncidents() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        vm.expectRevert(abi.encodeWithSelector(IncidentRegistry.EndpointAlreadyOpen.selector, 1));
        registry.openIncident(keccak256("report-2"), ENDPOINT, 2, EVIDENCE);
    }

    function testNewIncidentAllowedAfterRecovery() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        registry.resolveIncident(1, RECOVERY);
        uint256 id = registry.openIncident(keccak256("report-2"), ENDPOINT, 1, EVIDENCE);
        require(id == 2 && registry.incidentByReport(REPORT) == 1, "history remains addressable");
    }

    function testResolvedReportKeyCannotBeReplayed() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        registry.resolveIncident(1, RECOVERY);
        vm.expectRevert(abi.encodeWithSelector(IncidentRegistry.ReportAlreadyExists.selector, 1));
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
    }

    function testRecoveryRequiresExistingIncident() public {
        vm.expectRevert(IncidentRegistry.UnknownIncident.selector);
        registry.resolveIncident(123, RECOVERY);
    }

    function testCannotResolveTwice() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        registry.resolveIncident(1, RECOVERY);
        vm.expectRevert(IncidentRegistry.AlreadyResolved.selector);
        registry.resolveIncident(1, keccak256("replacement"));
        require(registry.getIncident(1).resolutionHash == RECOVERY, "recovery immutable");
    }

    function testZeroRecoveryEvidenceRejected() public {
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        vm.expectRevert(IncidentRegistry.ZeroValue.selector);
        registry.resolveIncident(1, bytes32(0));
    }

    function testZeroOpeningFieldsRejected() public {
        vm.expectRevert(IncidentRegistry.ZeroValue.selector);
        registry.openIncident(bytes32(0), ENDPOINT, 2, EVIDENCE);
        vm.expectRevert(IncidentRegistry.ZeroValue.selector);
        registry.openIncident(REPORT, bytes32(0), 2, EVIDENCE);
        vm.expectRevert(IncidentRegistry.ZeroValue.selector);
        registry.openIncident(REPORT, ENDPOINT, 2, bytes32(0));
    }

    function testInvalidSeverityRejected() public {
        vm.expectRevert(IncidentRegistry.InvalidSeverity.selector);
        registry.openIncident(REPORT, ENDPOINT, 0, EVIDENCE);
        vm.expectRevert(IncidentRegistry.InvalidSeverity.selector);
        registry.openIncident(REPORT, ENDPOINT, 4, EVIDENCE);
    }

    function testZeroReporterRejected() public {
        vm.expectRevert(IncidentRegistry.ZeroValue.selector);
        new IncidentRegistry(address(0));
    }

    function testUnknownReadRejected() public {
        vm.expectRevert(IncidentRegistry.UnknownIncident.selector);
        registry.getIncident(0);
    }

    function testFuzzDistinctEndpointsHaveIndependentLifecycles(bytes32 other) public {
        vm.assume(other != bytes32(0) && other != ENDPOINT);
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        registry.openIncident(keccak256("other-report"), other, 3, EVIDENCE);
        registry.resolveIncident(1, RECOVERY);
        require(registry.activeIncident(other) == 2 && registry.activeIncident(ENDPOINT) == 0, "isolated endpoints");
    }
}
