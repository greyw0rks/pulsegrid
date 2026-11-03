// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Attests what an identified monitor reported. It does not independently prove an outage.
contract IncidentRegistry {
    enum Status { Open, Resolved }

    struct Incident {
        address reporter;
        bytes32 endpointId;
        bytes32 reportKey;
        bytes32 evidenceHash;
        bytes32 resolutionHash;
        uint64 openedAt;
        uint64 resolvedAt;
        uint8 severity;
        Status status;
    }

    address public immutable authorizedReporter;
    uint256 public incidentCount;
    mapping(uint256 => Incident) private incidents;
    mapping(bytes32 => uint256) public incidentByReport;
    mapping(bytes32 => uint256) public activeIncident;

    error UnauthorizedReporter();
    error ZeroValue();
    error InvalidSeverity();
    error ReportAlreadyExists(uint256 incidentId);
    error EndpointAlreadyOpen(uint256 incidentId);
    error UnknownIncident();
    error AlreadyResolved();

    event IncidentOpened(
        uint256 indexed incidentId,
        bytes32 indexed endpointId,
        address indexed reporter,
        bytes32 reportKey,
        uint8 severity,
        bytes32 evidenceHash,
        uint64 openedAt
    );
    event IncidentResolved(
        uint256 indexed incidentId,
        bytes32 indexed endpointId,
        address indexed reporter,
        bytes32 resolutionHash,
        uint64 resolvedAt
    );

    constructor(address reporter) {
        if (reporter == address(0)) revert ZeroValue();
        authorizedReporter = reporter;
    }

    modifier onlyReporter() {
        if (msg.sender != authorizedReporter) revert UnauthorizedReporter();
        _;
    }

    function openIncident(bytes32 reportKey, bytes32 endpointId, uint8 severity, bytes32 evidenceHash)
        external onlyReporter returns (uint256 incidentId)
    {
        if (reportKey == bytes32(0) || endpointId == bytes32(0) || evidenceHash == bytes32(0)) revert ZeroValue();
        if (severity == 0 || severity > 3) revert InvalidSeverity();
        if (incidentByReport[reportKey] != 0) revert ReportAlreadyExists(incidentByReport[reportKey]);
        if (activeIncident[endpointId] != 0) revert EndpointAlreadyOpen(activeIncident[endpointId]);

        incidentId = ++incidentCount;
        uint64 openedAt = uint64(block.timestamp);
        incidents[incidentId] = Incident({
            reporter: msg.sender,
            endpointId: endpointId,
            reportKey: reportKey,
            evidenceHash: evidenceHash,
            resolutionHash: bytes32(0),
            openedAt: openedAt,
            resolvedAt: 0,
            severity: severity,
            status: Status.Open
        });
        incidentByReport[reportKey] = incidentId;
        activeIncident[endpointId] = incidentId;
        emit IncidentOpened(incidentId, endpointId, msg.sender, reportKey, severity, evidenceHash, openedAt);
    }

    function resolveIncident(uint256 incidentId, bytes32 resolutionHash) external onlyReporter {
        Incident storage incident = incidents[incidentId];
        if (incident.reporter == address(0)) revert UnknownIncident();
        if (incident.status == Status.Resolved) revert AlreadyResolved();
        if (resolutionHash == bytes32(0)) revert ZeroValue();

        incident.status = Status.Resolved;
        incident.resolutionHash = resolutionHash;
        incident.resolvedAt = uint64(block.timestamp);
        delete activeIncident[incident.endpointId];
        emit IncidentResolved(incidentId, incident.endpointId, msg.sender, resolutionHash, incident.resolvedAt);
    }

    function getIncident(uint256 incidentId) external view returns (Incident memory) {
        if (incidents[incidentId].reporter == address(0)) revert UnknownIncident();
        return incidents[incidentId];
    }
}
