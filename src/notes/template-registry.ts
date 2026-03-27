import type { MethodologyTemplate } from "../types";

export const TEMPLATES: MethodologyTemplate[] = [
  {
    id: "recon",
    name: "Reconnaissance",
    tags: ["recon", "osint", "enumeration"],
    sections: [
      "Passive Reconnaissance",
      "Active Reconnaissance",
      "DNS Enumeration",
      "Subdomain Discovery",
      "Port Scanning",
      "Service Version Detection",
      "Web Technology Fingerprinting",
      "OSINT",
    ],
    defaultChecklist: [
      "Perform passive recon using OSINT (Shodan, Censys, SecurityTrails)",
      "Enumerate subdomains with amass and subfinder",
      "Run full port scan with nmap -p- -sV -sC",
      "Identify web technologies with whatweb or httpx",
      "Check DNS records: A, MX, TXT, SPF, DMARC, DKIM",
      "Search for leaked credentials on breach aggregators",
      "Check GitHub for exposed secrets or internal references",
      "Enumerate virtual hosts",
    ],
  },
  {
    id: "web-application",
    name: "Web Application Testing",
    tags: ["web", "webapp", "http"],
    sections: [
      "Authentication Testing",
      "Authorization Testing",
      "Input Validation",
      "SQL Injection",
      "Cross-Site Scripting (XSS)",
      "Server-Side Request Forgery (SSRF)",
      "XML External Entity (XXE)",
      "Insecure Direct Object Reference (IDOR)",
      "Business Logic Testing",
      "File Upload Testing",
      "API Testing",
      "Session Management",
    ],
    defaultChecklist: [
      "Map all endpoints with gobuster or ffuf",
      "Test authentication flows for bypass vulnerabilities",
      "Check all input fields for SQL injection with sqlmap",
      "Test for reflected, stored, and DOM XSS",
      "Check for SSRF via URL parameters and headers",
      "Test file upload for unrestricted file types",
      "Review API endpoints for broken object level authorization",
      "Test JWT tokens for weak secrets and algorithm confusion",
      "Check for CORS misconfiguration",
      "Test password reset flow for predictable tokens",
    ],
  },
  {
    id: "initial-access-network",
    name: "Initial Access — Network",
    tags: ["initial-access", "network", "perimeter"],
    sections: [
      "Service Exploitation",
      "Credential Attacks",
      "VPN and Remote Access Testing",
      "Email Phishing",
      "SMB Vulnerabilities",
      "RDP Vulnerabilities",
    ],
    defaultChecklist: [
      "Run vulnerability scan against all discovered services",
      "Test for default and weak credentials on exposed services",
      "Check for EternalBlue / MS17-010 on Windows hosts",
      "Test RDP for BlueKeep and DejaBlue",
      "Enumerate SMB shares and null session access",
      "Check for Responder / LLMNR/NBT-NS poisoning opportunities",
      "Test VPN endpoints for credential stuffing",
    ],
  },
  {
    id: "privilege-escalation-linux",
    name: "Privilege Escalation — Linux",
    tags: ["privesc", "linux", "local"],
    sections: [
      "SUID / SGID Binaries",
      "Sudo Misconfigurations",
      "Writable Paths and Cron Jobs",
      "Kernel Exploits",
      "Service Misconfigurations",
      "Capabilities",
      "NFS and Shared Directories",
      "Password Reuse and Credentials in Files",
    ],
    defaultChecklist: [
      "Run linpeas.sh for automated enumeration",
      "Check sudo -l for allowed commands",
      "Find SUID/SGID binaries: find / -perm -4000 2>/dev/null",
      "Enumerate cron jobs and writable cron directories",
      "Check for writable /etc/passwd or /etc/shadow",
      "Inspect running processes and their owners with pspy",
      "Check for readable private SSH keys",
      "Enumerate NFS exports for no_root_squash",
      "Check kernel version against known exploits",
      "Review capabilities: getcap -r / 2>/dev/null",
    ],
  },
  {
    id: "privilege-escalation-windows",
    name: "Privilege Escalation — Windows",
    tags: ["privesc", "windows", "local"],
    sections: [
      "Service Misconfigurations",
      "Unquoted Service Paths",
      "Registry Autoruns",
      "Token Impersonation",
      "AlwaysInstallElevated",
      "DLL Hijacking",
      "Stored Credentials",
      "Kernel Exploits",
    ],
    defaultChecklist: [
      "Run winpeas.exe or PowerUp.ps1 for automated enumeration",
      "Check for unquoted service paths",
      "Enumerate services with weak permissions using accesschk",
      "Check AlwaysInstallElevated registry keys",
      "Inspect scheduled tasks for writable binary paths",
      "Look for credentials in registry with reg query",
      "Check for stored credentials with cmdkey /list",
      "Enumerate token privileges for impersonation opportunities",
      "Check for DLL hijacking in service binary paths",
      "Review autoruns with Autoruns64.exe or reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    ],
  },
  {
    id: "active-directory",
    name: "Active Directory",
    tags: ["ad", "active-directory", "windows", "kerberos"],
    sections: [
      "Domain Enumeration",
      "Kerberoasting",
      "AS-REP Roasting",
      "Pass the Hash",
      "Pass the Ticket",
      "Lateral Movement",
      "ACL Abuse",
      "DCSync",
      "ADCS Abuse",
      "GPO Abuse",
      "BloodHound Analysis",
    ],
    defaultChecklist: [
      "Run BloodHound / SharpHound to map domain",
      "Enumerate domain users, groups, and computers with ldapsearch or PowerView",
      "Kerberoast: GetUserSPNs.py or Invoke-Kerberoast",
      "AS-REP Roast users with no pre-auth required",
      "Check for ACL paths to Domain Admin in BloodHound",
      "Enumerate ADCS templates with certipy find",
      "Check for ESC1-ESC8 certificate template vulnerabilities",
      "Attempt DCSync if SeReplication privilege obtained",
      "Enumerate unconstrained delegation hosts",
      "Check for constrained delegation with S4U2Proxy abuse",
      "Look for LAPS passwords in AD attributes",
      "Enumerate GPO permissions for writable policies",
    ],
  },
  {
    id: "lateral-movement",
    name: "Lateral Movement",
    tags: ["lateral-movement", "pivoting", "post-exploitation"],
    sections: [
      "Pass the Hash / Pass the Key",
      "Remote Service Execution",
      "WMI and WinRM",
      "SMB Lateral Movement",
      "DCOM",
      "Tunneling and Pivoting",
    ],
    defaultChecklist: [
      "Use CrackMapExec to spray hashes across subnet",
      "Test WinRM access with Evil-WinRM",
      "Attempt PSExec / SMBExec for remote code execution",
      "Use WMIExec for fileless lateral movement",
      "Set up SOCKS proxy via Chisel or Ligolo-ng",
      "Configure proxychains for traffic routing through pivot",
      "Use impacket-smbclient to enumerate share access with new credentials",
    ],
  },
  {
    id: "post-exploitation",
    name: "Post-Exploitation",
    tags: ["post-exploitation", "persistence", "exfil"],
    sections: [
      "Credential Harvesting",
      "Persistence Mechanisms",
      "Defense Evasion",
      "Data Exfiltration",
      "Covering Tracks",
    ],
    defaultChecklist: [
      "Dump LSASS with mimikatz sekurlsa::logonpasswords",
      "Dump SAM/SYSTEM hive for offline cracking",
      "Extract credentials from browser stores",
      "Search for sensitive files: passwords, keys, configs",
      "Establish persistence via registry run keys or scheduled tasks",
      "Exfiltrate data over DNS, HTTPS, or allowed protocols",
      "Clear Windows event logs if within scope",
      "Remove added user accounts and reverse configuration changes",
    ],
  },
  {
    id: "cloud-aws",
    name: "Cloud — AWS",
    tags: ["cloud", "aws", "amazon"],
    sections: [
      "IAM Enumeration",
      "S3 Bucket Assessment",
      "EC2 Instance Metadata",
      "Lambda and Serverless",
      "RDS and Database Services",
      "CloudTrail and Logging Review",
      "Privilege Escalation in AWS",
    ],
    defaultChecklist: [
      "Enumerate IAM users, roles, and policies with pacu or enumerate-iam",
      "Check for public S3 buckets and sensitive object ACLs",
      "Access EC2 metadata at http://169.254.169.254/latest/meta-data/",
      "Extract IAM role credentials from instance metadata",
      "Check for IMDSv1 (unauthenticated metadata access)",
      "Enumerate Lambda functions and their environment variables",
      "Look for overly permissive IAM policies allowing privilege escalation",
      "Check CloudTrail for disabled logging or log deletion",
      "Enumerate secrets in Secrets Manager and Parameter Store",
      "Check for public RDS snapshots",
    ],
  },
];

export class TemplateRegistry {
  getAll(): MethodologyTemplate[] {
    return TEMPLATES;
  }

  getById(id: string): MethodologyTemplate | undefined {
    return TEMPLATES.find((t) => t.id === id);
  }

  detectTemplate(noteContent: string): MethodologyTemplate | undefined {
    const lower = noteContent.toLowerCase();
    let bestMatch: MethodologyTemplate | undefined;
    let bestScore = 0;

    for (const template of TEMPLATES) {
      let score = 0;
      for (const tag of template.tags) {
        if (lower.includes(tag)) score += 2;
      }
      for (const section of template.sections) {
        if (lower.includes(section.toLowerCase())) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }

    return bestScore >= 2 ? bestMatch : undefined;
  }

  getMissingGaps(noteContent: string, template: MethodologyTemplate): string[] {
    const lower = noteContent.toLowerCase();
    return template.sections.filter(
      (section) => !lower.includes(section.toLowerCase())
    );
  }
}
