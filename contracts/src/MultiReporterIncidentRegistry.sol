// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Identified wallets attest retained observations; this does not prove an outage or independence.
contract MultiReporterIncidentRegistry {
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

    address public immutable owner;
    mapping(address => bool) public isReporter;
    uint256 public incidentCount;
    mapping(uint256 => Incident) private incidents;
    mapping(address => mapping(bytes32 => uint256)) public incidentByReport;
    mapping(address => mapping(bytes32 => uint256)) public activeIncident;

    error UnauthorizedOwner();
    error UnauthorizedReporter();
    error NotIncidentReporter();
    error ZeroValue();
    error InvalidSeverity();
    error ReportAlreadyExists(uint256 incidentId);
    error EndpointAlreadyOpen(uint256 incidentId);
    error UnknownIncident();
    error AlreadyResolved();

    event ReporterPermission(address indexed reporter, bool enabled);
    event IncidentOpened(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter,
        bytes32 reportKey, uint8 severity, bytes32 evidenceHash, uint64 openedAt);
    event IncidentResolved(uint256 indexed incidentId, bytes32 indexed endpointId, address indexed reporter,
        bytes32 resolutionHash, uint64 resolvedAt);

    constructor(address initialOwner, address[] memory reporters) {
        if (initialOwner == address(0)) revert ZeroValue();
        owner = initialOwner;
        isReporter[initialOwner] = true;
        emit ReporterPermission(initialOwner, true);
        for (uint256 i; i < reporters.length; ++i) {
            if (reporters[i] == address(0)) revert ZeroValue();
            if (!isReporter[reporters[i]]) {
                isReporter[reporters[i]] = true;
                emit ReporterPermission(reporters[i], true);
            }
        }
    }

    function setReporter(address reporter, bool enabled) external {
        if (msg.sender != owner) revert UnauthorizedOwner();
        if (reporter == address(0)) revert ZeroValue();
        isReporter[reporter] = enabled;
        emit ReporterPermission(reporter, enabled);
    }

    function openIncident(bytes32 reportKey, bytes32 endpointId, uint8 severity, bytes32 evidenceHash)
        external returns (uint256 incidentId)
    {
        if (!isReporter[msg.sender]) revert UnauthorizedReporter();
        if (reportKey == bytes32(0) || endpointId == bytes32(0) || evidenceHash == bytes32(0)) revert ZeroValue();
        if (severity == 0 || severity > 3) revert InvalidSeverity();
        uint256 previous = incidentByReport[msg.sender][reportKey];
        if (previous != 0) revert ReportAlreadyExists(previous);
        uint256 active = activeIncident[msg.sender][endpointId];
        if (active != 0) revert EndpointAlreadyOpen(active);

        incidentId = ++incidentCount;
        uint64 openedAt = uint64(block.timestamp);
        incidents[incidentId] = Incident(msg.sender, endpointId, reportKey, evidenceHash, bytes32(0), openedAt, 0, severity, Status.Open);
        incidentByReport[msg.sender][reportKey] = incidentId;
        activeIncident[msg.sender][endpointId] = incidentId;
        emit IncidentOpened(incidentId, endpointId, msg.sender, reportKey, severity, evidenceHash, openedAt);
    }

    function resolveIncident(uint256 incidentId, bytes32 resolutionHash) external {
        Incident storage incident = incidents[incidentId];
        if (incident.reporter == address(0)) revert UnknownIncident();
        if (msg.sender != incident.reporter) revert NotIncidentReporter();
        if (incident.status == Status.Resolved) revert AlreadyResolved();
        if (resolutionHash == bytes32(0)) revert ZeroValue();
        // Revocation stops new reports; the original reporter can still close its own historical incident.
        incident.status = Status.Resolved;
        incident.resolutionHash = resolutionHash;
        incident.resolvedAt = uint64(block.timestamp);
        delete activeIncident[msg.sender][incident.endpointId];
        emit IncidentResolved(incidentId, incident.endpointId, msg.sender, resolutionHash, incident.resolvedAt);
    }

    function getIncident(uint256 incidentId) external view returns (Incident memory) {
        if (incidents[incidentId].reporter == address(0)) revert UnknownIncident();
        return incidents[incidentId];
    }
}
