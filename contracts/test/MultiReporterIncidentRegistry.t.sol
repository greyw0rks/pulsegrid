// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {MultiReporterIncidentRegistry as Registry} from "../src/MultiReporterIncidentRegistry.sol";
import {Vm} from "./IncidentRegistry.t.sol";

contract MultiReporterIncidentRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Registry registry;
    address constant ALICE = address(0xa11ce);
    address constant BOB = address(0xb0b);
    bytes32 constant REPORT = keccak256("retained-report");
    bytes32 constant ENDPOINT = keccak256("observed-endpoint");
    bytes32 constant EVIDENCE = keccak256("opening-source");
    bytes32 constant RECOVERY = keccak256("recovery-source");

    function setUp() public {
        address[] memory reporters = new address[](2);
        reporters[0] = ALICE; reporters[1] = BOB;
        registry = new Registry(address(this), reporters);
    }
    function openAs(address reporter, bytes32 report, bytes32 endpoint) internal returns(uint256) {
        vm.prank(reporter); return registry.openIncident(report, endpoint, 2, EVIDENCE);
    }
    function testThreeReportersHaveIndependentLifecyclesForSameRetainedSource() public {
        address[3] memory reporters = [address(this), ALICE, BOB];
        vm.warp(1000);
        for (uint256 i; i < 3; ++i) {
            uint256 id = openAs(reporters[i], REPORT, ENDPOINT);
            require(id == i + 1 && registry.incidentByReport(reporters[i], REPORT) == id, "report scoped to wallet");
            require(registry.getIncident(id).reporter == reporters[i], "actual reporter");
        }
        vm.warp(1200);
        for (uint256 i; i < 3; ++i) {
            vm.prank(reporters[i]); registry.resolveIncident(i + 1, RECOVERY);
            Registry.Incident memory result = registry.getIncident(i + 1);
            require(result.evidenceHash == EVIDENCE && result.resolutionHash == RECOVERY, "distinct source commitments retained");
            require(result.openedAt == 1000 && result.resolvedAt == 1200, "timestamps retained");
            require(result.status == Registry.Status.Resolved && registry.activeIncident(reporters[i], ENDPOINT) == 0, "resolved for own wallet");
        }
        require(registry.incidentCount() == 3, "three wallet reports");
    }
    function testReporterCannotResolveAnotherWalletsIncident() public {
        uint256 id = openAs(ALICE, REPORT, ENDPOINT);
        vm.prank(BOB); vm.expectRevert(Registry.NotIncidentReporter.selector); registry.resolveIncident(id, RECOVERY);
        vm.expectRevert(Registry.NotIncidentReporter.selector); registry.resolveIncident(id, RECOVERY);
        require(registry.getIncident(id).resolutionHash == bytes32(0), "report cannot be changed");
    }
    function testRevokedReporterCannotOpenButCanResolveOwnExistingIncident() public {
        uint256 id = openAs(ALICE, REPORT, ENDPOINT);
        registry.setReporter(ALICE, false);
        vm.prank(ALICE); vm.expectRevert(Registry.UnauthorizedReporter.selector);
        registry.openIncident(keccak256("another"), keccak256("another-endpoint"), 2, EVIDENCE);
        vm.prank(ALICE); registry.resolveIncident(id, RECOVERY);
        registry.setReporter(ALICE, true);
        require(openAs(ALICE, keccak256("new-report"), ENDPOINT) == 2, "re-enabled reporter");
    }
    function testUnapprovedWalletCannotOpenOrGrantItselfPermission() public {
        vm.prank(address(0xbad)); vm.expectRevert(Registry.UnauthorizedReporter.selector); registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        vm.prank(ALICE); vm.expectRevert(Registry.UnauthorizedOwner.selector); registry.setReporter(address(0xbad), true);
    }
    function testRetryCannotDuplicateWalletReportEvenAfterRecovery() public {
        uint256 id = openAs(ALICE, REPORT, ENDPOINT);
        vm.prank(ALICE); registry.resolveIncident(id, RECOVERY);
        vm.prank(ALICE); vm.expectRevert(abi.encodeWithSelector(Registry.ReportAlreadyExists.selector, id));
        registry.openIncident(REPORT, ENDPOINT, 2, EVIDENCE);
        require(openAs(BOB, REPORT, ENDPOINT) == 2, "different wallet can attest same observation");
    }
    function testOnlyOneActiveIncidentPerWalletAndEndpoint() public {
        uint256 id = openAs(ALICE, REPORT, ENDPOINT);
        vm.prank(ALICE); vm.expectRevert(abi.encodeWithSelector(Registry.EndpointAlreadyOpen.selector, id));
        registry.openIncident(keccak256("another-report"), ENDPOINT, 1, EVIDENCE);
        require(openAs(BOB, REPORT, ENDPOINT) == 2, "other reporter isolated");
    }
    function testZeroValuesInvalidSeverityAndUnknownIncidentRejected() public {
        vm.expectRevert(Registry.ZeroValue.selector); registry.setReporter(address(0), true);
        vm.expectRevert(Registry.ZeroValue.selector); registry.openIncident(bytes32(0), ENDPOINT, 1, EVIDENCE);
        vm.expectRevert(Registry.ZeroValue.selector); registry.openIncident(REPORT, bytes32(0), 1, EVIDENCE);
        vm.expectRevert(Registry.ZeroValue.selector); registry.openIncident(REPORT, ENDPOINT, 1, bytes32(0));
        vm.expectRevert(Registry.InvalidSeverity.selector); registry.openIncident(REPORT, ENDPOINT, 0, EVIDENCE);
        vm.expectRevert(Registry.InvalidSeverity.selector); registry.openIncident(REPORT, ENDPOINT, 4, EVIDENCE);
        vm.expectRevert(Registry.UnknownIncident.selector); registry.getIncident(0);
        vm.expectRevert(Registry.UnknownIncident.selector); registry.resolveIncident(123, RECOVERY);
        uint256 id = registry.openIncident(REPORT, ENDPOINT, 1, EVIDENCE);
        vm.expectRevert(Registry.ZeroValue.selector); registry.resolveIncident(id, bytes32(0));
        registry.resolveIncident(id, RECOVERY);
        vm.expectRevert(Registry.AlreadyResolved.selector); registry.resolveIncident(id, keccak256("replacement"));
    }
    function testConstructorRejectsZeroOwnerOrReporter() public {
        address[] memory reporters = new address[](1); reporters[0] = ALICE;
        vm.expectRevert(Registry.ZeroValue.selector); new Registry(address(0), reporters);
        reporters[0] = address(0);
        vm.expectRevert(Registry.ZeroValue.selector); new Registry(address(this), reporters);
    }
    function testFuzzReportOwnershipIsEnforced(address other) public {
        vm.assume(other != ALICE);
        uint256 id = openAs(ALICE, REPORT, ENDPOINT);
        vm.prank(other); vm.expectRevert(Registry.NotIncidentReporter.selector); registry.resolveIncident(id, RECOVERY);
        require(registry.getIncident(id).status == Registry.Status.Open, "ownership preserved");
    }
}
